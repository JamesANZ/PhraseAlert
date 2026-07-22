/**
 * @title GET /api/billing/status
 * @notice Returns plan, watch limit, active watch count, and billing period for the session user.
 * @custom:auth Required session
 */
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/session";
import { getBillingStatus } from "@/lib/billing/entitlements";
import { countActiveWatches } from "@/lib/watches";
import { initDb } from "@/lib/db";

export async function GET() {
  try {
    await initDb();
    const userId = await requireUserId();
    const status = await getBillingStatus(userId);
    if (!status) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...status,
      planPeriodEnd: status.planPeriodEnd?.toISOString() ?? null,
      activeWatches: await countActiveWatches(userId),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status failed";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
