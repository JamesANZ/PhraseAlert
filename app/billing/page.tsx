import Link from "next/link";
import { redirect } from "next/navigation";
import { BillingActions } from "@/components/BillingActions";
import { auth } from "@/lib/auth";
import { getBillingStatus } from "@/lib/billing/entitlements";
import {
  FREE_TIER_MAX_WATCHES,
  MAX_MONTHLY_PRICE_CENTS,
  MAX_TIER_MAX_WATCHES,
  PLUS_MONTHLY_PRICE_CENTS,
  PLUS_TIER_MAX_WATCHES,
} from "@/lib/constants";
import { initDb } from "@/lib/db";
import { countActiveWatches } from "@/lib/watches";

function dollars(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

function planTitle(plan: string): string {
  if (plan === "max") return "Max";
  if (plan === "plus") return "Plus";
  return "Free";
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/billing");
  }

  await initDb();
  const params = await searchParams;
  const status = await getBillingStatus(session.user.id);
  if (!status) {
    redirect("/login?callbackUrl=/billing");
  }

  const activeWatches = await countActiveWatches(session.user.id);
  const periodLabel = status.planPeriodEnd
    ? status.planPeriodEnd.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const isPaid =
    status.effectivePlan === "plus" || status.effectivePlan === "max";
  const modeLabel = isPaid
    ? status.billingMode === "subscription"
      ? "Monthly subscription"
      : status.billingMode === "prepaid"
        ? "Prepaid month"
        : planTitle(status.effectivePlan)
    : "Free";

  return (
    <main className="page-shell page-shell-app billing-page">
      <div className="app-page app-page-wide">
        <div className="page-header">
          <p className="eyebrow">Billing</p>
          <h1>Watch more phrases at once</h1>
          <p>
            Choose a plan, then subscribe or pay one month by card or crypto.
          </p>
        </div>

        {params.success && (
          <p className="billing-banner billing-banner-success" role="status">
            Payment received. Your plan will update shortly. Refresh if you
            still see Free.
          </p>
        )}
        {params.canceled && (
          <p className="billing-banner" role="status">
            Checkout canceled. No charge was made.
          </p>
        )}

        <section className="billing-status">
          <div>
            <p className="billing-label">Current plan</p>
            <p className="billing-value">
              {planTitle(status.effectivePlan)}
              <span className="billing-meta"> · {modeLabel}</span>
            </p>
          </div>
          <div>
            <p className="billing-label">Active alerts</p>
            <p className="billing-value">
              {activeWatches} / {status.watchLimit}
            </p>
          </div>
          {periodLabel && isPaid && (
            <div>
              <p className="billing-label">
                {status.billingMode === "prepaid" ? "Expires" : "Renews / ends"}
              </p>
              <p className="billing-value">{periodLabel}</p>
            </div>
          )}
        </section>

        <div className="pricing-grid billing-plans">
          <div className="plan plan-muted">
            <h3 className="plan-name">Free</h3>
            <p className="plan-price">
              <span className="plan-amount">$0</span>
            </p>
            <ul className="plan-features">
              <li>{FREE_TIER_MAX_WATCHES} active alerts</li>
              <li>Daily checks</li>
              <li>Email notifications</li>
            </ul>
            {status.effectivePlan === "free" && (
              <p className="billing-plan-current">Your plan</p>
            )}
          </div>
          <div className="plan plan-featured">
            <h3 className="plan-name">Plus</h3>
            <p className="plan-price">
              <span className="plan-amount">
                ${dollars(PLUS_MONTHLY_PRICE_CENTS)}
              </span>
              <span className="plan-period">/month</span>
            </p>
            <ul className="plan-features">
              <li>{PLUS_TIER_MAX_WATCHES} active alerts</li>
              <li>Checks every 6 hours, up to hourly</li>
              <li>Email and SMS notifications</li>
            </ul>
            {status.effectivePlan === "plus" ? (
              <p className="billing-plan-current">Your plan</p>
            ) : (
              <p className="billing-plan-tag">Most popular</p>
            )}
          </div>
          <div className="plan plan-featured plan-max">
            <h3 className="plan-name">Max</h3>
            <p className="plan-price">
              <span className="plan-amount">
                ${dollars(MAX_MONTHLY_PRICE_CENTS)}
              </span>
              <span className="plan-period">/month</span>
            </p>
            <ul className="plan-features">
              <li>{MAX_TIER_MAX_WATCHES} active alerts</li>
              <li>Hourly checks, up to every 15 minutes</li>
              <li>Email and SMS notifications</li>
            </ul>
            {status.effectivePlan === "max" ? (
              <p className="billing-plan-current">Your plan</p>
            ) : (
              <p className="billing-plan-tag">Fastest checks</p>
            )}
          </div>
        </div>

        {isPaid && status.billingMode === "prepaid" && (
          <p className="billing-note">
            Prepaid access must be topped up before it expires. If it lapses, we
            pause your newest alerts down to {FREE_TIER_MAX_WATCHES} so your
            oldest alerts stay active.
          </p>
        )}

        <BillingActions
          effectivePlan={status.effectivePlan}
          billingMode={status.billingMode}
          hasStripeCustomer={Boolean(status.stripeCustomerId)}
          phoneE164={status.phoneE164}
        />

        <p style={{ marginTop: 32 }}>
          <Link href="/watches">Back to my alerts</Link>
        </p>
      </div>
    </main>
  );
}
