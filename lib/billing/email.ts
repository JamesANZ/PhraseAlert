import {
  FREE_TIER_MAX_WATCHES,
  MAX_TIER_MAX_WATCHES,
  PLUS_TIER_MAX_WATCHES,
} from "@/lib/constants";
import { getPublicAppUrl } from "@/lib/billing/stripe";
import type { PausedWatchSummary } from "@/lib/billing/enforce-limits";
import type { PaidPlan } from "@/lib/billing/entitlements";
import { Resend } from "resend";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "PhraseAlert <onboarding@resend.dev>";
}

function planLabel(plan: PaidPlan): string {
  return plan === "max" ? "Max" : "Plus";
}

function planWatchCap(plan: PaidPlan): number {
  return plan === "max" ? MAX_TIER_MAX_WATCHES : PLUS_TIER_MAX_WATCHES;
}

export async function sendExpiryReminderEmail(
  email: string,
  daysLeft: number,
  periodEnd: Date,
  plan: PaidPlan = "plus",
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn("[billing] RESEND_API_KEY missing; skip expiry reminder");
    return;
  }

  const billingUrl = `${getPublicAppUrl()}/billing`;
  const when = periodEnd.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const label = planLabel(plan);
  const cap = planWatchCap(plan);

  await resend.emails.send({
    from: fromAddress(),
    to: email,
    subject:
      daysLeft === 1
        ? `Your PhraseAlert ${label} expires tomorrow`
        : `Your PhraseAlert ${label} expires in ${daysLeft} days`,
    text: [
      `Your prepaid PhraseAlert ${label} access ends on ${when}.`,
      "",
      `Top up before then to keep up to ${cap} active alerts. If it expires, we'll pause your newest alerts down to the free limit of ${FREE_TIER_MAX_WATCHES}.`,
      "",
      `Extend here: ${billingUrl}`,
    ].join("\n"),
  });
}

export async function sendDowngradeEmail(
  email: string,
  paused: PausedWatchSummary[],
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn("[billing] RESEND_API_KEY missing; skip downgrade email");
    return;
  }

  const billingUrl = `${getPublicAppUrl()}/billing`;
  const lines =
    paused.length === 0
      ? [
          `You're now on the Free plan (${FREE_TIER_MAX_WATCHES} active alerts).`,
        ]
      : [
          `You're now on the Free plan (${FREE_TIER_MAX_WATCHES} active alerts).`,
          "",
          "We paused your newest alerts so you stay within the free limit:",
          ...paused.map((w) => `• ${w.rawInput}`),
          "",
          "You can resume alerts after upgrading, as long as you're within your plan limit.",
        ];

  await resend.emails.send({
    from: fromAddress(),
    to: email,
    subject: "PhraseAlert paid plan ended, moved to Free",
    text: [...lines, "", `Renew: ${billingUrl}`].join("\n"),
  });
}
