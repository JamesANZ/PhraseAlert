"use client";

import { useState } from "react";
import type { Plan } from "@/lib/billing/entitlements";
import {
  MAX_MONTHLY_PRICE_CENTS,
  PLUS_MONTHLY_PRICE_CENTS,
} from "@/lib/constants";

type Method = "stripe_sub" | "stripe_prepaid" | "helio";
type PaidPlan = "plus" | "max";

interface BillingActionsProps {
  effectivePlan: Plan;
  billingMode: "none" | "subscription" | "prepaid";
  hasStripeCustomer: boolean;
  phoneE164: string | null;
}

function dollars(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

export function BillingActions({
  effectivePlan,
  billingMode,
  hasStripeCustomer,
  phoneE164,
}: BillingActionsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState(phoneE164 ?? "");
  const [phoneMsg, setPhoneMsg] = useState("");

  const isPaid = effectivePlan === "plus" || effectivePlan === "max";
  const isSubscription = billingMode === "subscription" && isPaid;
  const isPrepaid = billingMode === "prepaid" && isPaid;
  const smsAllowed = isPaid;

  async function startCheckout(method: Method, plan: PaidPlan) {
    setLoading(`${method}:${plan}`);
    setError("");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, plan }),
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

  async function savePhone(sendTest: boolean) {
    setLoading(sendTest ? "phone-test" : "phone");
    setError("");
    setPhoneMsg("");
    try {
      const res = await fetch("/api/billing/phone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim() || null,
          sendTest,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save phone");
      setPhone(data.phoneE164 ?? "");
      setPhoneMsg(
        sendTest
          ? "Saved and sent a test SMS."
          : data.phoneE164
            ? "Phone saved for SMS alerts."
            : "Phone removed.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save phone");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="billing-actions">
      {error && <p className="form-error">{error}</p>}

      {effectivePlan !== "max" && (
        <>
          {!isSubscription && (
            <div className="billing-action-group">
              <h3>
                {effectivePlan === "plus" ? "Upgrade to Max" : "Subscribe"}
              </h3>
              <p>
                Card subscription. Plus ${dollars(PLUS_MONTHLY_PRICE_CENTS)}
                /mo · Max ${dollars(MAX_MONTHLY_PRICE_CENTS)}/mo.
              </p>
              <div className="billing-btn-row">
                {effectivePlan === "free" && (
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={loading !== null}
                    onClick={() => void startCheckout("stripe_sub", "plus")}
                  >
                    {loading === "stripe_sub:plus"
                      ? "Redirecting…"
                      : `Subscribe Plus ($${dollars(PLUS_MONTHLY_PRICE_CENTS)}/mo)`}
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={loading !== null}
                  onClick={() => void startCheckout("stripe_sub", "max")}
                >
                  {loading === "stripe_sub:max"
                    ? "Redirecting…"
                    : `Subscribe Max ($${dollars(MAX_MONTHLY_PRICE_CENTS)}/mo)`}
                </button>
              </div>
            </div>
          )}

          <div className="billing-action-group">
            <h3>{isPrepaid ? "Extend another month" : "Pay one month"}</h3>
            <p>
              One-time payment by card or crypto. Top up before it expires. We
              email reminders at 7, 3, and 1 days out.
            </p>
            <div className="billing-btn-row">
              <button
                className="btn btn-primary"
                type="button"
                disabled={loading !== null}
                onClick={() => void startCheckout("stripe_prepaid", "plus")}
              >
                {loading === "stripe_prepaid:plus"
                  ? "Redirecting…"
                  : `Plus card ($${dollars(PLUS_MONTHLY_PRICE_CENTS)})`}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={loading !== null}
                onClick={() => void startCheckout("helio", "plus")}
              >
                {loading === "helio:plus"
                  ? "Redirecting…"
                  : `Plus crypto ($${dollars(PLUS_MONTHLY_PRICE_CENTS)})`}
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={loading !== null}
                onClick={() => void startCheckout("stripe_prepaid", "max")}
              >
                {loading === "stripe_prepaid:max"
                  ? "Redirecting…"
                  : `Max card ($${dollars(MAX_MONTHLY_PRICE_CENTS)})`}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={loading !== null}
                onClick={() => void startCheckout("helio", "max")}
              >
                {loading === "helio:max"
                  ? "Redirecting…"
                  : `Max crypto ($${dollars(MAX_MONTHLY_PRICE_CENTS)})`}
              </button>
            </div>
          </div>
        </>
      )}

      {effectivePlan === "max" && isPrepaid && (
        <div className="billing-action-group">
          <h3>Extend Max another month</h3>
          <div className="billing-btn-row">
            <button
              className="btn btn-primary"
              type="button"
              disabled={loading !== null}
              onClick={() => void startCheckout("stripe_prepaid", "max")}
            >
              {loading === "stripe_prepaid:max"
                ? "Redirecting…"
                : `Max card ($${dollars(MAX_MONTHLY_PRICE_CENTS)})`}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={loading !== null}
              onClick={() => void startCheckout("helio", "max")}
            >
              {loading === "helio:max"
                ? "Redirecting…"
                : `Max crypto ($${dollars(MAX_MONTHLY_PRICE_CENTS)})`}
            </button>
          </div>
        </div>
      )}

      {(isSubscription || hasStripeCustomer) && (
        <div className="billing-action-group">
          <h3>Manage subscription</h3>
          <p>Update your card or cancel auto-renew in Stripe.</p>
          <div className="billing-btn-row">
            <button
              className="btn btn-ghost"
              type="button"
              disabled={loading !== null}
              onClick={() => void openPortal()}
            >
              {loading === "portal" ? "Opening…" : "Open billing portal"}
            </button>
          </div>
        </div>
      )}

      {smsAllowed && (
        <div className="billing-action-group">
          <h3>SMS alerts</h3>
          <p>
            Optional. Use an international format with country code (e.g.
            +14155552671).
          </p>
          <div className="billing-btn-row" style={{ flexWrap: "wrap" }}>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+14155552671"
              aria-label="Phone number for SMS"
              style={{ minWidth: 200, flex: 1 }}
            />
            <button
              className="btn btn-primary"
              type="button"
              disabled={loading !== null}
              onClick={() => void savePhone(false)}
            >
              {loading === "phone" ? "Saving…" : "Save phone"}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={loading !== null || !phone.trim()}
              onClick={() => void savePhone(true)}
            >
              {loading === "phone-test" ? "Sending…" : "Save & test SMS"}
            </button>
          </div>
          {phoneMsg && <p className="billing-note">{phoneMsg}</p>}
        </div>
      )}
    </div>
  );
}
