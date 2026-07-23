import Stripe from "stripe";
import { PLUS_MONTHLY_PRICE_CENTS } from "@/lib/constants";
import { getUser, setStripeCustomerId } from "@/lib/billing/entitlements";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

export function getAppUrl(): string {
  return (
    process.env.AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  );
}

export async function getOrCreateStripeCustomer(
  userId: string,
): Promise<string> {
  const user = await getUser(userId);
  if (!user) throw new Error("User not found");
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name ?? undefined,
    metadata: { userId },
  });
  await setStripeCustomerId(userId, customer.id);
  return customer.id;
}

export async function createSubscriptionCheckout(
  userId: string,
): Promise<string> {
  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRICE_ID_PLUS_MONTHLY;
  if (!priceId) {
    throw new Error("STRIPE_PRICE_ID_PLUS_MONTHLY is not configured");
  }

  const customerId = await getOrCreateStripeCustomer(userId);
  const appUrl = getAppUrl();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/billing?success=1`,
    cancel_url: `${appUrl}/billing?canceled=1`,
    metadata: { userId, kind: "subscription" },
    subscription_data: {
      metadata: { userId },
    },
  });

  if (!session.url) throw new Error("Failed to create Stripe Checkout session");
  return session.url;
}

export async function createPrepaidCheckout(userId: string): Promise<string> {
  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(userId);
  const appUrl = getAppUrl();

  const priceId = process.env.STRIPE_PRICE_ID_PLUS_PREPAID;
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = priceId
    ? [{ price: priceId, quantity: 1 }]
    : [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: PLUS_MONTHLY_PRICE_CENTS,
            product_data: {
              name: "PhraseAlert Plus, 1 month",
              description: "One month of Plus (25 active alerts)",
            },
          },
        },
      ];

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: lineItems,
    success_url: `${appUrl}/billing?success=1`,
    cancel_url: `${appUrl}/billing?canceled=1`,
    metadata: { userId, kind: "prepaid_month" },
  });

  if (!session.url) throw new Error("Failed to create Stripe Checkout session");
  return session.url;
}

export async function createCustomerPortal(userId: string): Promise<string> {
  const stripe = getStripe();
  const user = await getUser(userId);
  if (!user?.stripeCustomerId) {
    throw new Error("No Stripe customer on file");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${getAppUrl()}/billing`,
  });

  return session.url;
}
