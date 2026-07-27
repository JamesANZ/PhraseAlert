/**
 * @title Billing entitlements
 * @notice Resolves effective plan, watch limits, and paid-plan grant/revoke for a user.
 * @dev Plus/Max stay active for subscription (until period end) or prepaid (until planPeriodEnd).
 */
import { eq, inArray } from "drizzle-orm";
import {
  FREE_TIER_MAX_WATCHES,
  MAX_TIER_MAX_WATCHES,
  PLUS_TIER_MAX_WATCHES,
} from "@/lib/constants";
import { db } from "@/lib/db";
import { authUsers, type DbUser } from "@/lib/db/schema";

export type BillingMode = "none" | "subscription" | "prepaid";
export type Plan = "free" | "plus" | "max";
export type PaidPlan = "plus" | "max";

/** @notice Snapshot returned by GET /api/billing/status. */
export interface BillingStatus {
  plan: Plan;
  effectivePlan: Plan;
  billingMode: BillingMode;
  planPeriodEnd: Date | null;
  stripeCustomerId: string | null;
  watchLimit: number;
  email: string | null;
  phoneE164: string | null;
}

const PAID_PLANS: PaidPlan[] = ["plus", "max"];

/** @dev Subscription stays active without period end; prepaid requires future planPeriodEnd. */
function isPaidPlanActive(user: DbUser, now = Date.now()): boolean {
  if (user.plan !== "plus" && user.plan !== "max") return false;

  if (user.billingMode === "subscription") {
    return !(user.planPeriodEnd && user.planPeriodEnd.getTime() <= now);
  }

  if (user.billingMode === "prepaid") {
    return Boolean(user.planPeriodEnd && user.planPeriodEnd.getTime() > now);
  }

  return Boolean(user.planPeriodEnd && user.planPeriodEnd.getTime() > now);
}

/** @notice Effective plan after expiry checks (max > plus > free). */
export function getEffectivePlan(user: DbUser, now = Date.now()): Plan {
  if (!isPaidPlanActive(user, now)) return "free";
  if (user.plan === "max") return "max";
  if (user.plan === "plus") return "plus";
  return "free";
}

export function watchLimitForPlan(plan: Plan): number {
  if (plan === "max") return MAX_TIER_MAX_WATCHES;
  if (plan === "plus") return PLUS_TIER_MAX_WATCHES;
  return FREE_TIER_MAX_WATCHES;
}

/** @notice True when the effective plan includes SMS alerts. */
export function planAllowsSms(plan: Plan): boolean {
  return plan === "plus" || plan === "max";
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
  return watchLimitForPlan(getEffectivePlan(user, now));
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

  const effectivePlan = getEffectivePlan(user, now);
  return {
    plan: user.plan as Plan,
    effectivePlan,
    billingMode: user.billingMode,
    planPeriodEnd: user.planPeriodEnd,
    stripeCustomerId: user.stripeCustomerId,
    watchLimit: watchLimitForPlan(effectivePlan),
    email: user.email,
    phoneE164: user.phoneE164 ?? null,
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

export async function setUserPhone(
  userId: string,
  phoneE164: string | null,
): Promise<void> {
  await db
    .update(authUsers)
    .set({
      phoneE164,
      phoneVerifiedAt: phoneE164 ? new Date() : null,
    })
    .where(eq(authUsers.id, userId));
}

export async function grantPlan(params: {
  userId: string;
  plan: PaidPlan;
  mode: BillingMode;
  periodEnd: Date | null;
}): Promise<void> {
  await db
    .update(authUsers)
    .set({
      plan: params.plan,
      billingMode: params.mode,
      planPeriodEnd: params.periodEnd,
    })
    .where(eq(authUsers.id, params.userId));
}

/** @deprecated Prefer grantPlan — kept for call-site clarity during Plus-only flows. */
export async function grantPlus(params: {
  userId: string;
  mode: BillingMode;
  periodEnd: Date | null;
}): Promise<void> {
  await grantPlan({ ...params, plan: "plus" });
}

export async function revokePaidPlan(userId: string): Promise<void> {
  await db
    .update(authUsers)
    .set({
      plan: "free",
      billingMode: "none",
      planPeriodEnd: null,
    })
    .where(eq(authUsers.id, userId));
}

/** @deprecated Prefer revokePaidPlan. */
export async function revokePlus(userId: string): Promise<void> {
  await revokePaidPlan(userId);
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
  ).filter((u) => PAID_PLANS.includes(u.plan as PaidPlan) && u.planPeriodEnd);

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

export async function listExpiredPaidUsers(
  now = Date.now(),
): Promise<DbUser[]> {
  return (
    await db
      .select()
      .from(authUsers)
      .where(inArray(authUsers.plan, ["plus", "max"]))
  ).filter((u) => {
    if (!u.planPeriodEnd) {
      return u.billingMode !== "subscription";
    }
    return u.planPeriodEnd.getTime() <= now;
  });
}

/** @deprecated Prefer listExpiredPaidUsers. */
export async function listExpiredPlusUsers(
  now = Date.now(),
): Promise<DbUser[]> {
  return listExpiredPaidUsers(now);
}

/** @notice Batch-resolve effective plans for cron due checks. */
export async function getEffectivePlansForUsers(
  userIds: string[],
  now = Date.now(),
): Promise<Map<string, Plan>> {
  const unique = [...new Set(userIds)];
  const result = new Map<string, Plan>();
  if (unique.length === 0) return result;

  const rows = await db
    .select()
    .from(authUsers)
    .where(inArray(authUsers.id, unique));

  for (const row of rows) {
    result.set(row.id, getEffectivePlan(row, now));
  }
  for (const id of unique) {
    if (!result.has(id)) result.set(id, "free");
  }
  return result;
}
