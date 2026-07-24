/**
 * @title Product constants
 * @notice Tier limits and billing amounts shared across entitlements and UI.
 * @dev Single source of truth for free vs plus watch caps and prepaid period length.
 */

/** @notice Maximum active (`watching`) watches on the free plan. */
export const FREE_TIER_MAX_WATCHES = 3;

/** @notice Maximum active watches when Plus is active. */
export const PLUS_TIER_MAX_WATCHES = 25;

/** @notice Plus subscription price in US cents ($9.00/month). */
export const PLUS_MONTHLY_PRICE_CENTS = 900;

/** @dev Prepaid Helio period duration in milliseconds (30 days). */
export const PREPAID_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/** @dev Days-before-expiry offsets for prepaid renewal reminder emails. */
export const EXPIRY_REMINDER_DAYS = [7, 3, 1] as const;
