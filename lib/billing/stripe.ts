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

const PRODUCTION_APP_URL = "https://phrasealert.com";

function normalizeOrigin(url: string): string {
  const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  return withProtocol.replace(/\/$/, "");
}

function isLocalhostUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * @notice Base URL for the running app (may be localhost in local dev).
 */
export function getAppUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined,
    process.env.AUTH_URL,
  ].filter((value): value is string => Boolean(value?.trim()));

  for (const candidate of candidates) {
    const origin = normalizeOrigin(candidate.trim());
    if (!isLocalhostUrl(origin)) return origin;
  }

  if (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  ) {
    return PRODUCTION_APP_URL;
  }

  const local = candidates[0];
  return local ? normalizeOrigin(local.trim()) : "http://localhost:3000";
}

/**
 * @notice Public site URL for emails and outbound links — never localhost.
 */
export function getPublicAppUrl(): string {
  const url = getAppUrl();
  return isLocalhostUrl(url) ? PRODUCTION_APP_URL : url;
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
