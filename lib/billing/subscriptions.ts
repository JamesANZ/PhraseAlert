import { and, eq } from "drizzle-orm";
import { PLUS_MONTHLY_PRICE_CENTS, PREPAID_PERIOD_MS } from "@/lib/constants";
import { db } from "@/lib/db";
import { billingEvents, subscriptions } from "@/lib/db/schema";
import {
  getUser,
  grantPlan,
  revokePaidPlan,
  watchLimitForPlan,
  type PaidPlan,
} from "@/lib/billing/entitlements";
import { pauseExcessWatches } from "@/lib/billing/enforce-limits";

export async function hasProcessedEvent(eventId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(billingEvents)
    .where(eq(billingEvents.id, eventId))
    .limit(1);
  return Boolean(rows[0]);
}

export async function recordBillingEvent(
  eventId: string,
  provider: "stripe" | "helio",
  eventType: string,
): Promise<void> {
  await db.insert(billingEvents).values({
    id: eventId,
    provider,
    eventType,
    processedAt: new Date(),
  });
}

export async function upsertSubscription(params: {
  userId: string;
  provider: "stripe" | "helio";
  providerRef: string;
  mode: "subscription" | "prepaid";
  status: string;
  currentPeriodEnd: Date | null;
  amountCents?: number;
  currency?: string;
}): Promise<void> {
  const existingRows = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.provider, params.provider),
        eq(subscriptions.providerRef, params.providerRef),
      ),
    )
    .limit(1);
  const existing = existingRows[0];

  const now = new Date();
  if (existing) {
    await db
      .update(subscriptions)
      .set({
        status: params.status,
        currentPeriodEnd: params.currentPeriodEnd,
        amountCents: params.amountCents ?? existing.amountCents,
        currency: params.currency ?? existing.currency,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, existing.id));
    return;
  }

  await db.insert(subscriptions).values({
    id: crypto.randomUUID(),
    userId: params.userId,
    provider: params.provider,
    providerRef: params.providerRef,
    mode: params.mode,
    status: params.status,
    currentPeriodEnd: params.currentPeriodEnd,
    amountCents: params.amountCents ?? PLUS_MONTHLY_PRICE_CENTS,
    currency: params.currency ?? "usd",
    createdAt: now,
    updatedAt: now,
  });
}

export async function computeExtendedPeriodEnd(
  userId: string,
  now = Date.now(),
): Promise<Date> {
  const user = await getUser(userId);
  const base =
    user?.planPeriodEnd && user.planPeriodEnd.getTime() > now
      ? user.planPeriodEnd.getTime()
      : now;
  return new Date(base + PREPAID_PERIOD_MS);
}

export async function activatePrepaid(
  userId: string,
  provider: "stripe" | "helio",
  providerRef: string,
  options: { plan?: PaidPlan; periodEnd?: Date; amountCents?: number } = {},
): Promise<Date> {
  const plan = options.plan ?? "plus";
  const end = options.periodEnd ?? (await computeExtendedPeriodEnd(userId));
  await upsertSubscription({
    userId,
    provider,
    providerRef,
    mode: "prepaid",
    status: "active",
    currentPeriodEnd: end,
    amountCents: options.amountCents,
  });
  await grantPlan({ userId, plan, mode: "prepaid", periodEnd: end });
  return end;
}

export async function activateSubscription(params: {
  userId: string;
  providerRef: string;
  status: string;
  periodEnd: Date | null;
  plan?: PaidPlan;
  amountCents?: number;
}): Promise<void> {
  const plan = params.plan ?? "plus";
  const active =
    params.status === "active" ||
    params.status === "trialing" ||
    params.status === "past_due";

  await upsertSubscription({
    userId: params.userId,
    provider: "stripe",
    providerRef: params.providerRef,
    mode: "subscription",
    status: params.status,
    currentPeriodEnd: params.periodEnd,
    amountCents: params.amountCents,
  });

  if (active) {
    await grantPlan({
      userId: params.userId,
      plan,
      mode: "subscription",
      periodEnd: params.periodEnd,
    });
  } else {
    await downgradeUser(params.userId);
  }
}

/**
 * @notice Revoke paid plan and pause excess watches down to the free cap.
 * @dev When `toPlan` is plus (e.g. Max→Plus), pause down to Plus cap instead.
 */
export async function downgradeUser(
  userId: string,
  toPlan: "free" | "plus" = "free",
): Promise<{
  paused: Awaited<ReturnType<typeof pauseExcessWatches>>;
}> {
  if (toPlan === "free") {
    await revokePaidPlan(userId);
  } else {
    await grantPlan({
      userId,
      plan: "plus",
      mode: "none",
      periodEnd: null,
    });
  }
  const paused = await pauseExcessWatches(userId, watchLimitForPlan(toPlan));
  return { paused };
}

export async function markSubscriptionCanceled(
  providerRef: string,
): Promise<string | null> {
  const existingRows = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.provider, "stripe"),
        eq(subscriptions.providerRef, providerRef),
      ),
    )
    .limit(1);
  const existing = existingRows[0];

  if (!existing) return null;

  await db
    .update(subscriptions)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(subscriptions.id, existing.id));

  return existing.userId;
}
