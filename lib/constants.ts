/**
 * @title Product constants
 * @notice Tier limits, prices, and check-cadence windows shared across entitlements and UI.
 * @dev Single source of truth for free / plus / max caps and prepaid period length.
 */

/** @notice Maximum active (`watching`) watches on the free plan. */
export const FREE_TIER_MAX_WATCHES = 3;

/** @notice Maximum active watches when Plus is active. */
export const PLUS_TIER_MAX_WATCHES = 25;

/** @notice Maximum active watches when Max is active. */
export const MAX_TIER_MAX_WATCHES = 100;

/** @notice Plus subscription price in US cents ($9.99/month). */
export const PLUS_MONTHLY_PRICE_CENTS = 999;

/** @notice Max subscription price in US cents ($39.99/month). */
export const MAX_MONTHLY_PRICE_CENTS = 3999;

/** @dev Prepaid Helio/Stripe period duration in milliseconds (30 days). */
export const PREPAID_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/** @dev Days-before-expiry offsets for prepaid renewal reminder emails. */
export const EXPIRY_REMINDER_DAYS = [7, 3, 1] as const;

/** @dev Quiet-watch baseline intervals by plan (milliseconds). */
export const PLAN_BASELINE_MS = {
  free: 23 * 3600_000,
  plus: 6 * 3600_000,
  max: 1 * 3600_000,
} as const;

/**
 * @dev Fastest AI-scheduled recheck interval by plan (milliseconds).
 * @notice Follow-ups may not fire sooner than this ceiling.
 */
export const PLAN_CEILING_MS = {
  free: 23 * 3600_000,
  plus: 1 * 3600_000,
  max: 15 * 60_000,
} as const;

/** @dev Soft wall-clock budget for one checks cron invocation (ms). */
export const CHECKS_CRON_TIME_BUDGET_MS = 50_000;
