"use client";

import { useState } from "react";

type Method = "stripe_sub" | "stripe_prepaid" | "helio";

interface BillingActionsProps {
  effectivePlan: "free" | "plus";
  billingMode: "none" | "subscription" | "prepaid";
  hasStripeCustomer: boolean;
}

export function BillingActions({
  effectivePlan,
  billingMode,
  hasStripeCustomer,
}: BillingActionsProps) {
  const [loading, setLoading] = useState<Method | "portal" | null>(null);
  const [error, setError] = useState("");

  async function startCheckout(method: Method) {
    setLoading(method);
    setError("");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setLoading(null);
    }
  }

  async function openPortal() {
    setLoading("portal");
    setError("");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Portal failed");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Portal failed");
      setLoading(null);
    }
  }

  const isPlus = effectivePlan === "plus";
  const isSubscription = billingMode === "subscription" && isPlus;
  const isPrepaid = billingMode === "prepaid" && isPlus;

  return (
    <div className="billing-actions">
      {error && <p className="form-error">{error}</p>}

      {!isSubscription && (
        <div className="billing-action-group">
          <h3>Subscribe monthly</h3>
          <p>Recurring card payment. Renews each month.</p>
          <button
            className="btn btn-primary"
            type="button"
            disabled={loading !== null}
            onClick={() => void startCheckout("stripe_sub")}
          >
            {loading === "stripe_sub"
              ? "Redirecting…"
              : "Subscribe with card ($9/mo)"}
          </button>
        </div>
      )}

      <div className="billing-action-group">
        <h3>{isPrepaid ? "Extend another month" : "Pay one month"}</h3>
        <p>
          One-time payment by card or crypto. Top up before it expires to keep
          Plus; we email reminders at 7, 3, and 1 days out.
        </p>
        <div className="billing-btn-row">
          <button
            className="btn btn-primary"
            type="button"
            disabled={loading !== null}
            onClick={() => void startCheckout("stripe_prepaid")}
          >
            {loading === "stripe_prepaid"
              ? "Redirecting…"
              : "Pay with card ($9)"}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={loading !== null}
            onClick={() => void startCheckout("helio")}
          >
            {loading === "helio" ? "Redirecting…" : "Pay with crypto ($9)"}
          </button>
        </div>
      </div>

      {(isSubscription || hasStripeCustomer) && (
        <div className="billing-action-group">
          <h3>Manage subscription</h3>
          <p>Update your card or cancel auto-renew in Stripe.</p>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={loading !== null}
            onClick={() => void openPortal()}
          >
            {loading === "portal" ? "Opening…" : "Open billing portal"}
          </button>
        </div>
      )}
    </div>
  );
}
