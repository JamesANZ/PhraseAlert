/**
 * @title Watch notification emails
 * @notice Sends alert emails via Resend when a watch triggers.
 * @dev Recipient is the Google signup address on `user.email`. Soft-fails if RESEND_API_KEY is missing.
 */
import { Resend } from "resend";
import { getAppUrl } from "@/lib/billing/stripe";

export interface WatchTriggeredEmailPayload {
  watchId: string;
  rawInput: string;
  clarified: string;
  reasoning: string;
  evidence: Array<{
    url: string;
    domain: string;
    snippet: string;
  }>;
}

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
 * @param payload Watch phrase, decision reasoning, and top evidence links.
 */
export async function sendWatchTriggeredEmail(
  email: string,
  payload: WatchTriggeredEmailPayload,
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn("[notify] RESEND_API_KEY missing; skip watch email");
    return;
  }

  const watchesUrl = `${getAppUrl()}/watches`;
  const evidenceLines =
    payload.evidence.length === 0
      ? ["(no evidence links)"]
      : payload.evidence
          .slice(0, 5)
          .flatMap((e, i) =>
            [
              `${i + 1}. ${e.domain}`,
              `   ${e.url}`,
              e.snippet ? `   ${e.snippet.slice(0, 180)}` : "",
            ].filter(Boolean),
          );

  await resend.emails.send({
    from: fromAddress(),
    to: email,
    subject: `Alert triggered: ${payload.rawInput.slice(0, 80)}`,
    text: [
      "PhraseAlert found evidence that matches your watch.",
      "",
      `Watch: ${payload.rawInput}`,
      ...(payload.clarified ? [`Clarified: ${payload.clarified}`, ""] : [""]),
      `Why: ${payload.reasoning}`,
      "",
      "Evidence:",
      ...evidenceLines,
      "",
      `View your watches: ${watchesUrl}`,
    ].join("\n"),
  });
}
