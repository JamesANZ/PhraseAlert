/**
 * @title POST /api/billing/checkout
 * @notice Start Stripe subscription, Stripe prepaid, or Helio checkout; returns redirect URL.
 * @custom:auth Required session
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth/session";
import { createHelioCheckout } from "@/lib/billing/helio";
import {
  createPrepaidCheckout,
  createSubscriptionCheckout,
} from "@/lib/billing/stripe";
import { initDb } from "@/lib/db";

const BodySchema = z.object({
  method: z.enum(["stripe_sub", "stripe_prepaid", "helio"]),
});

export async function POST(request: Request) {
  try {
    await initDb();
    const userId = await requireUserId();
    const body = BodySchema.parse(await request.json());

    let url: string;
    if (body.method === "stripe_sub") {
      url = await createSubscriptionCheckout(userId);
    } else if (body.method === "stripe_prepaid") {
      url = await createPrepaidCheckout(userId);
    } else {
      url = await createHelioCheckout(userId);
    }

    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
