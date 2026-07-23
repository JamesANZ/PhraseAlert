import { Resend } from "resend";
import type { PausedWatchSummary } from "@/lib/billing/enforce-limits";
import { getAppUrl } from "@/lib/billing/stripe";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "Bellwether <onboarding@resend.dev>";
}

export async function sendExpiryReminderEmail(
  email: string,
  daysLeft: number,
  periodEnd: Date,
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn("[billing] RESEND_API_KEY missing; skip expiry reminder");
    return;
  }

  const billingUrl = `${getAppUrl()}/billing`;
  const when = periodEnd.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  await resend.emails.send({
    from: fromAddress(),
    to: email,
    subject:
      daysLeft === 1
        ? "Your Bellwether Plus expires tomorrow"
        : `Your Bellwether Plus expires in ${daysLeft} days`,
    text: [
      `Your prepaid Bellwether Plus access ends on ${when}.`,
      "",
      "Top up before then to keep up to 25 active alerts. If it expires, we'll pause your newest alerts down to the free limit of 3.",
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

  const billingUrl = `${getAppUrl()}/billing`;
  const lines =
    paused.length === 0
      ? ["You're now on the Free plan (3 active alerts)."]
      : [
          "You're now on the Free plan (3 active alerts).",
          "",
          "We paused your newest alerts so you stay within the free limit:",
          ...paused.map((w) => `• ${w.rawInput}`),
          "",
          "You can resume alerts after upgrading, as long as you're within your plan limit.",
        ];

  await resend.emails.send({
    from: fromAddress(),
    to: email,
    subject: "Bellwether Plus ended, moved to Free",
    text: [...lines, "", `Renew Plus: ${billingUrl}`].join("\n"),
  });
}
