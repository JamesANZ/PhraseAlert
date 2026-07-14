import { and, eq } from "drizzle-orm";
import { PLUS_MONTHLY_PRICE_CENTS, PREPAID_PERIOD_MS } from "@/lib/constants";
import { db } from "@/lib/db";
import { billingEvents, subscriptions } from "@/lib/db/schema";
import { getUser, grantPlus, revokePlus } from "@/lib/billing/entitlements";
import { pauseExcessWatches } from "@/lib/billing/enforce-limits";

export function hasProcessedEvent(eventId: string): boolean {
  const row = db
    .select()
    .from(billingEvents)
    .where(eq(billingEvents.id, eventId))
    .get();
  return Boolean(row);
}

export function recordBillingEvent(
  eventId: string,
  provider: "stripe" | "helio",
  eventType: string,
): void {
  db.insert(billingEvents)
    .values({
      id: eventId,
      provider,
      eventType,
      processedAt: new Date(),
    })
    .run();
}

export function upsertSubscription(params: {
  userId: string;
  provider: "stripe" | "helio";
  providerRef: string;
  mode: "subscription" | "prepaid";
  status: string;
  currentPeriodEnd: Date | null;
  amountCents?: number;
  currency?: string;
}): void {
  const existing = db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.provider, params.provider),
        eq(subscriptions.providerRef, params.providerRef),
      ),
    )
    .get();

  const now = new Date();
  if (existing) {
    db.update(subscriptions)
      .set({
        status: params.status,
        currentPeriodEnd: params.currentPeriodEnd,
        amountCents: params.amountCents ?? existing.amountCents,
        currency: params.currency ?? existing.currency,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, existing.id))
      .run();
    return;
  }

  db.insert(subscriptions)
    .values({
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
    })
    .run();
}

export function computeExtendedPeriodEnd(
  userId: string,
  now = Date.now(),
): Date {
  const user = getUser(userId);
  const base =
    user?.planPeriodEnd && user.planPeriodEnd.getTime() > now
      ? user.planPeriodEnd.getTime()
      : now;
  return new Date(base + PREPAID_PERIOD_MS);
}

export function activatePrepaid(
  userId: string,
  provider: "stripe" | "helio",
  providerRef: string,
  periodEnd?: Date,
): Date {
  const end = periodEnd ?? computeExtendedPeriodEnd(userId);
  upsertSubscription({
    userId,
    provider,
    providerRef,
    mode: "prepaid",
    status: "active",
    currentPeriodEnd: end,
  });
  grantPlus({ userId, mode: "prepaid", periodEnd: end });
  return end;
}

export function activateSubscription(params: {
  userId: string;
  providerRef: string;
  status: string;
  periodEnd: Date | null;
}): void {
  const active =
    params.status === "active" ||
    params.status === "trialing" ||
    params.status === "past_due";

  upsertSubscription({
    userId: params.userId,
    provider: "stripe",
    providerRef: params.providerRef,
    mode: "subscription",
    status: params.status,
    currentPeriodEnd: params.periodEnd,
  });

  if (active) {
    grantPlus({
      userId: params.userId,
      mode: "subscription",
      periodEnd: params.periodEnd,
    });
  } else {
    downgradeUser(params.userId);
  }
}

export function downgradeUser(userId: string): {
  paused: ReturnType<typeof pauseExcessWatches>;
} {
  revokePlus(userId);
  const paused = pauseExcessWatches(userId);
  return { paused };
}

export function markSubscriptionCanceled(providerRef: string): string | null {
  const existing = db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.provider, "stripe"),
        eq(subscriptions.providerRef, providerRef),
      ),
    )
    .get();

  if (!existing) return null;

  db.update(subscriptions)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(subscriptions.id, existing.id))
    .run();

  return existing.userId;
}
