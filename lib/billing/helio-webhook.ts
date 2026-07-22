import {
  activatePrepaid,
  hasProcessedEvent,
  recordBillingEvent,
} from "@/lib/billing/subscriptions";
import {
  extractHelioEventId,
  extractHelioUserId,
  verifyHelioSignature,
} from "@/lib/billing/helio";

export async function handleHelioWebhook(
  rawBody: string,
  request: Request,
): Promise<{
  ok: true;
}> {
  const sharedToken = process.env.HELIO_WEBHOOK_SECRET;
  if (!sharedToken) {
    throw new Error("HELIO_WEBHOOK_SECRET is not configured");
  }

  const signature = request.headers.get("x-signature");
  const auth = request.headers.get("authorization");

  if (auth && auth !== `Bearer ${sharedToken}`) {
    throw new Error("Invalid Helio authorization");
  }

  if (!verifyHelioSignature(rawBody, signature, sharedToken)) {
    throw new Error("Invalid Helio signature");
  }

  const payload = JSON.parse(rawBody) as unknown;
  const eventId = extractHelioEventId(payload);

  if (await hasProcessedEvent(eventId)) {
    return { ok: true };
  }

  const userId = extractHelioUserId(payload);
  if (!userId) {
    throw new Error("Helio webhook missing userId metadata");
  }

  await activatePrepaid(userId, "helio", eventId);
  await recordBillingEvent(eventId, "helio", "payment_completed");
  return { ok: true };
}
