import type Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe";
import {
  activatePrepaid,
  activateSubscription,
  downgradeUser,
  hasProcessedEvent,
  markSubscriptionCanceled,
  recordBillingEvent,
} from "@/lib/billing/subscriptions";
import { sendDowngradeEmail } from "@/lib/billing/email";
import { getUser } from "@/lib/billing/entitlements";

function periodEndFromSubscription(sub: Stripe.Subscription): Date | null {
  const end = sub.items?.data?.[0]?.current_period_end;
  if (!end) return null;
  return new Date(end * 1000);
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

export async function handleStripeWebhook(
  rawBody: string,
  signature: string,
): Promise<{ ok: true }> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");

  const stripe = getStripe();
  const event = stripe.webhooks.constructEvent(rawBody, signature, secret);

  if (await hasProcessedEvent(event.id)) {
    return { ok: true };
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const kind = session.metadata?.kind;
      if (!userId) break;

      if (kind === "prepaid_month" && session.payment_status === "paid") {
        await activatePrepaid(userId, "stripe", session.id);
      } else if (kind === "subscription" && session.subscription) {
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
        const sub = await stripe.subscriptions.retrieve(subId);
        await activateSubscription({
          userId,
          providerRef: sub.id,
          status: sub.status,
          periodEnd: periodEndFromSubscription(sub),
        });
      }
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.userId;
      if (!userId) break;
      await activateSubscription({
        userId,
        providerRef: sub.id,
        status: sub.status,
        periodEnd: periodEndFromSubscription(sub),
      });
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId =
        sub.metadata?.userId ?? (await markSubscriptionCanceled(sub.id));
      if (userId) {
        const { paused } = await downgradeUser(userId);
        const user = await getUser(userId);
        if (user?.email) {
          await sendDowngradeEmail(user.email, paused);
        }
      }
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = subscriptionIdFromInvoice(invoice);
      if (!subId) break;
      const sub = await stripe.subscriptions.retrieve(subId);
      const userId = sub.metadata?.userId;
      if (!userId) break;
      await activateSubscription({
        userId,
        providerRef: sub.id,
        status: sub.status,
        periodEnd: periodEndFromSubscription(sub),
      });
      break;
    }
    case "invoice.payment_failed": {
      break;
    }
    default:
      break;
  }

  await recordBillingEvent(event.id, "stripe", event.type);
  return { ok: true };
}
