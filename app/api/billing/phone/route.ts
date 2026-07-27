/**
 * @title GET|PUT /api/billing/phone
 * @notice Read or update the SMS phone number for Plus/Max users.
 * @custom:auth Required session
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth/session";
import {
  getBillingStatus,
  getEffectivePlan,
  getUser,
  planAllowsSms,
  setUserPhone,
} from "@/lib/billing/entitlements";
import { initDb } from "@/lib/db";
import { normalizePhoneE164, sendTestSms } from "@/lib/notifications/sms";

const BodySchema = z.object({
  phone: z.string().trim().min(8).max(20).nullable(),
  sendTest: z.boolean().optional(),
});

export async function GET() {
  try {
    await initDb();
    const userId = await requireUserId();
    const status = await getBillingStatus(userId);
    if (!status) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({
      phoneE164: status.phoneE164,
      smsAllowed: planAllowsSms(status.effectivePlan),
      effectivePlan: status.effectivePlan,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    const status = message === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: Request) {
  try {
    await initDb();
    const userId = await requireUserId();
    const user = await getUser(userId);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const effectivePlan = getEffectivePlan(user);
    if (!planAllowsSms(effectivePlan)) {
      return NextResponse.json(
        { error: "SMS is available on Plus and Max plans" },
        { status: 403 },
      );
    }

    const body = BodySchema.parse(await request.json());
    if (body.phone === null) {
      await setUserPhone(userId, null);
      return NextResponse.json({ phoneE164: null, ok: true });
    }

    const normalized = normalizePhoneE164(body.phone);
    if (!normalized) {
      return NextResponse.json(
        { error: "Enter a valid phone number with country code (E.164)" },
        { status: 400 },
      );
    }

    await setUserPhone(userId, normalized);

    if (body.sendTest) {
      await sendTestSms(normalized);
    }

    return NextResponse.json({ phoneE164: normalized, ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    const status = message === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
