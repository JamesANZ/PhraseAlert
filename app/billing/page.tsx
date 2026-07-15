import Link from "next/link";
import { redirect } from "next/navigation";
import { BillingActions } from "@/components/BillingActions";
import { auth } from "@/lib/auth";
import { getBillingStatus } from "@/lib/billing/entitlements";
import { FREE_TIER_MAX_WATCHES, PLUS_TIER_MAX_WATCHES } from "@/lib/constants";
import { initDb } from "@/lib/db";
import { countActiveWatches } from "@/lib/watches";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/billing");
  }

  initDb();
  const params = await searchParams;
  const status = getBillingStatus(session.user.id);
  if (!status) {
    redirect("/login?callbackUrl=/billing");
  }

  const activeWatches = countActiveWatches(session.user.id);
  const periodLabel = status.planPeriodEnd
    ? status.planPeriodEnd.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const modeLabel =
    status.effectivePlan === "plus"
      ? status.billingMode === "subscription"
        ? "Monthly subscription"
        : status.billingMode === "prepaid"
          ? "Prepaid month"
          : "Plus"
      : "Free";

  return (
    <main className="page-shell page-shell-app billing-page">
      <div className="app-page">
        <div className="page-header">
          <p className="eyebrow">Billing</p>
          <h1>Watch more at once</h1>
          <p>
            Free includes {FREE_TIER_MAX_WATCHES} natural-language watches. Plus
            unlocks {PLUS_TIER_MAX_WATCHES} for $9/month — pay by card
            subscription, one month by card, or crypto.
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
              {status.effectivePlan === "plus" ? "Plus" : "Free"}
              <span className="billing-meta"> · {modeLabel}</span>
            </p>
          </div>
          <div>
            <p className="billing-label">Active watches</p>
            <p className="billing-value">
              {activeWatches} / {status.watchLimit}
            </p>
          </div>
          {periodLabel && status.effectivePlan === "plus" && (
            <div>
              <p className="billing-label">
                {status.billingMode === "prepaid" ? "Expires" : "Renews / ends"}
              </p>
              <p className="billing-value">{periodLabel}</p>
            </div>
          )}
        </section>

        {status.effectivePlan === "plus" &&
          status.billingMode === "prepaid" && (
            <p className="billing-note">
              Prepaid Plus must be topped up before it expires. If it lapses, we
              pause your newest watches down to {FREE_TIER_MAX_WATCHES} so your
              oldest watches stay active.
            </p>
          )}

        <BillingActions
          effectivePlan={status.effectivePlan}
          billingMode={status.billingMode}
          hasStripeCustomer={Boolean(status.stripeCustomerId)}
        />

        <p style={{ marginTop: 32 }}>
          <Link href="/watches">Back to your watches</Link>
        </p>
      </div>
    </main>
  );
}
