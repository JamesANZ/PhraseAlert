/**
 * @title Watch notification emails
 * @notice Sends alert emails via Resend when a watch triggers.
 * @dev Recipient is the Google signup address on `user.email`. Soft-fails if RESEND_API_KEY is missing.
 */
import { Resend } from "resend";
import { getPublicAppUrl } from "@/lib/billing/stripe";
import {
  formatFindingsEmailHtml,
  formatFindingsEmailText,
  type WatchFindings,
} from "@/lib/findings";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "PhraseAlert <onboarding@resend.dev>";
}

/**
 * @notice Email the user that their watch found confirming evidence.
 * @param email Destination address (Google signup email).
 * @param findings Shared findings payload (same content as the dashboard detail page).
 */
export async function sendWatchTriggeredEmail(
  email: string,
  findings: WatchFindings,
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn("[notify] RESEND_API_KEY missing; skip watch email");
    return;
  }

  const detailUrl = `${getPublicAppUrl()}/watches/${findings.watchId}`;

  await resend.emails.send({
    from: fromAddress(),
    to: email,
    subject: `Alert triggered: ${findings.rawInput.slice(0, 80)}`,
    text: formatFindingsEmailText(findings, detailUrl),
    html: formatFindingsEmailHtml(findings, detailUrl),
  });
}
