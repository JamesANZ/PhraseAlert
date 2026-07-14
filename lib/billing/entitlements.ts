import { eq } from "drizzle-orm";
import { FREE_TIER_MAX_WATCHES, PLUS_TIER_MAX_WATCHES } from "@/lib/constants";
import { db } from "@/lib/db";
import { authUsers, type DbUser } from "@/lib/db/schema";

export type BillingMode = "none" | "subscription" | "prepaid";
export type Plan = "free" | "plus";

export interface BillingStatus {
  plan: Plan;
  effectivePlan: Plan;
  billingMode: BillingMode;
  planPeriodEnd: Date | null;
  stripeCustomerId: string | null;
  watchLimit: number;
  email: string | null;
}

function isPlusActive(user: DbUser, now = Date.now()): boolean {
  if (user.plan !== "plus") return false;

  if (user.billingMode === "subscription") {
    if (user.planPeriodEnd && user.planPeriodEnd.getTime() <= now) {
      return false;
    }
    return true;
  }

  if (user.billingMode === "prepaid") {
    return Boolean(user.planPeriodEnd && user.planPeriodEnd.getTime() > now);
  }

  return Boolean(user.planPeriodEnd && user.planPeriodEnd.getTime() > now);
}

export function getUser(userId: string): DbUser | null {
  return (
    db.select().from(authUsers).where(eq(authUsers.id, userId)).get() ?? null
  );
}

export function getWatchLimitForUser(user: DbUser, now = Date.now()): number {
  return isPlusActive(user, now)
    ? PLUS_TIER_MAX_WATCHES
    : FREE_TIER_MAX_WATCHES;
}

export function getWatchLimit(userId: string, now = Date.now()): number {
  const user = getUser(userId);
  if (!user) return FREE_TIER_MAX_WATCHES;
  return getWatchLimitForUser(user, now);
}

export function getBillingStatus(
  userId: string,
  now = Date.now(),
): BillingStatus | null {
  const user = getUser(userId);
  if (!user) return null;

  const active = isPlusActive(user, now);
  return {
    plan: user.plan,
    effectivePlan: active ? "plus" : "free",
    billingMode: user.billingMode,
    planPeriodEnd: user.planPeriodEnd,
    stripeCustomerId: user.stripeCustomerId,
    watchLimit: active ? PLUS_TIER_MAX_WATCHES : FREE_TIER_MAX_WATCHES,
    email: user.email,
  };
}

export function setStripeCustomerId(userId: string, customerId: string): void {
  db.update(authUsers)
    .set({ stripeCustomerId: customerId })
    .where(eq(authUsers.id, userId))
    .run();
}

export function grantPlus(params: {
  userId: string;
  mode: BillingMode;
  periodEnd: Date | null;
}): void {
  db.update(authUsers)
    .set({
      plan: "plus",
      billingMode: params.mode,
      planPeriodEnd: params.periodEnd,
    })
    .where(eq(authUsers.id, params.userId))
    .run();
}

export function revokePlus(userId: string): void {
  db.update(authUsers)
    .set({
      plan: "free",
      billingMode: "none",
      planPeriodEnd: null,
    })
    .where(eq(authUsers.id, userId))
    .run();
}

export function listUsersNeedingExpiryReminders(
  dayOffsets: readonly number[],
  now = Date.now(),
): Array<DbUser & { daysLeft: number }> {
  const dayMs = 24 * 60 * 60 * 1000;
  const users = db
    .select()
    .from(authUsers)
    .where(eq(authUsers.billingMode, "prepaid"))
    .all()
    .filter((u) => u.plan === "plus" && u.planPeriodEnd);

  const matches: Array<DbUser & { daysLeft: number }> = [];
  for (const user of users) {
    const end = user.planPeriodEnd!.getTime();
    const daysLeft = Math.ceil((end - now) / dayMs);
    if (dayOffsets.includes(daysLeft) && end > now) {
      matches.push({ ...user, daysLeft });
    }
  }
  return matches;
}

export function listExpiredPlusUsers(now = Date.now()): DbUser[] {
  return db
    .select()
    .from(authUsers)
    .where(eq(authUsers.plan, "plus"))
    .all()
    .filter((u) => {
      if (!u.planPeriodEnd) {
        // Subscription without period end still considered active until webhook says otherwise
        return u.billingMode !== "subscription";
      }
      return u.planPeriodEnd.getTime() <= now;
    });
}
