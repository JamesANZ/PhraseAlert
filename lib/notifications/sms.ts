/**
 * @title SMS notifications (Twilio)
 * @notice Sends short alert SMS for Plus/Max users with a verified phone.
 * @custom:env TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 */
import type { WatchFindings } from "@/lib/findings";

function twilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER,
  );
}

/** @notice Normalize user input to E.164 when possible; otherwise return trimmed input. */
export function normalizePhoneE164(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (digits.startsWith("+") && /^\+\d{8,15}$/.test(digits)) return digits;
  const only = trimmed.replace(/\D/g, "");
  if (only.length >= 8 && only.length <= 15) return `+${only}`;
  return null;
}

/**
 * @notice Send a compact SMS when a watch triggers.
 * @dev No-ops (warns) when Twilio env is missing so email-only deploys still work.
 */
export async function sendWatchTriggeredSms(
  toE164: string,
  findings: WatchFindings,
): Promise<void> {
  if (!twilioConfigured()) {
    console.warn("[sms] Twilio not configured; skip SMS");
    return;
  }

  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM_NUMBER!;

  const summary = findings.summary.replace(/\s+/g, " ").trim().slice(0, 280);
  const body = `PhraseAlert: ${findings.rawInput.slice(0, 80)}\n${summary}`;

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const params = new URLSearchParams({
    To: toE164,
    From: from,
    Body: body.slice(0, 1500),
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio SMS failed: ${res.status} ${text}`);
  }
}

/** @notice Send a one-line smoke-test SMS. */
export async function sendTestSms(toE164: string): Promise<void> {
  await sendWatchTriggeredSms(toE164, {
    watchId: "test",
    checkId: "test",
    rawInput: "Test alert",
    clarified: "Test alert",
    summary: "This is a PhraseAlert SMS test. Your phone is configured.",
    decideReasoning: "test",
    confidence: 1,
    triggeredAt: new Date().toISOString(),
    sources: [],
  });
}
