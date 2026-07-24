/**
 * @title Billing entitlements
 * @notice Resolves effective plan, watch limits, and Plus grant/revoke for a user.
 * @dev Plus is active for subscription (until period end) or prepaid (until planPeriodEnd).
 */
import { eq } from "drizzle-orm";
import { FREE_TIER_MAX_WATCHES, PLUS_TIER_MAX_WATCHES } from "@/lib/constants";
import { db } from "@/lib/db";
import { authUsers, type DbUser } from "@/lib/db/schema";

export type BillingMode = "none" | "subscription" | "prepaid";
export type Plan = "free" | "plus";

/** @notice Snapshot returned by GET /api/billing/status. */
export interface BillingStatus {
  plan: Plan;
  effectivePlan: Plan;
  billingMode: BillingMode;
  planPeriodEnd: Date | null;
  stripeCustomerId: string | null;
  watchLimit: number;
  email: string | null;
}

/** @dev Subscription stays active without period end; prepaid requires future planPeriodEnd. */
function isPlusActive(user: DbUser, now = Date.now()): boolean {
  if (user.plan !== "plus") return false;

  if (user.billingMode === "subscription") {
    return !(user.planPeriodEnd && user.planPeriodEnd.getTime() <= now);
  }

  if (user.billingMode === "prepaid") {
    return Boolean(user.planPeriodEnd && user.planPeriodEnd.getTime() > now);
  }

  return Boolean(user.planPeriodEnd && user.planPeriodEnd.getTime() > now);
}

export async function getUser(userId: string): Promise<DbUser | null> {
  const rows = await db
    .select()
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

export function getWatchLimitForUser(user: DbUser, now = Date.now()): number {
  return isPlusActive(user, now)
    ? PLUS_TIER_MAX_WATCHES
    : FREE_TIER_MAX_WATCHES;
}

/** @notice Active watch cap for a user id (free default if user missing). */
export async function getWatchLimit(
  userId: string,
  now = Date.now(),
): Promise<number> {
  const user = await getUser(userId);
  if (!user) return FREE_TIER_MAX_WATCHES;
  return getWatchLimitForUser(user, now);
}

export async function getBillingStatus(
  userId: string,
  now = Date.now(),
): Promise<BillingStatus | null> {
  const user = await getUser(userId);
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

export async function setStripeCustomerId(
  userId: string,
  customerId: string,
): Promise<void> {
  await db
    .update(authUsers)
    .set({ stripeCustomerId: customerId })
    .where(eq(authUsers.id, userId));
}

export async function grantPlus(params: {
  userId: string;
  mode: BillingMode;
  periodEnd: Date | null;
}): Promise<void> {
  await db
    .update(authUsers)
    .set({
      plan: "plus",
      billingMode: params.mode,
      planPeriodEnd: params.periodEnd,
    })
    .where(eq(authUsers.id, params.userId));
}

export async function revokePlus(userId: string): Promise<void> {
  await db
    .update(authUsers)
    .set({
      plan: "free",
      billingMode: "none",
      planPeriodEnd: null,
    })
    .where(eq(authUsers.id, userId));
}

export async function listUsersNeedingExpiryReminders(
  dayOffsets: readonly number[],
  now = Date.now(),
): Promise<Array<DbUser & { daysLeft: number }>> {
  const dayMs = 24 * 60 * 60 * 1000;
  const users = (
    await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.billingMode, "prepaid"))
  ).filter((u) => u.plan === "plus" && u.planPeriodEnd);

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

export async function listExpiredPlusUsers(
  now = Date.now(),
): Promise<DbUser[]> {
  return (
    await db.select().from(authUsers).where(eq(authUsers.plan, "plus"))
  ).filter((u) => {
    if (!u.planPeriodEnd) {
      // Subscription without period end still considered active until webhook says otherwise
      return u.billingMode !== "subscription";
    }
    return u.planPeriodEnd.getTime() <= now;
  });
}
