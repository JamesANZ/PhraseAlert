import { createHmac, timingSafeEqual } from "crypto";
import {
  MAX_MONTHLY_PRICE_CENTS,
  PLUS_MONTHLY_PRICE_CENTS,
} from "@/lib/constants";
import { getAppUrl } from "@/lib/billing/stripe";
import { getUser, type PaidPlan } from "@/lib/billing/entitlements";

const HELIO_API_BASE = process.env.HELIO_API_BASE ?? "https://api.hel.io/v1";

export function verifyHelioSignature(
  rawBody: string,
  signature: string | null,
  sharedToken: string,
): boolean {
  if (!signature) return false;
  const computed = createHmac("sha256", sharedToken)
    .update(rawBody)
    .digest("hex");

  try {
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(computed, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function helioPaylinkId(plan: PaidPlan): string {
  if (plan === "max") {
    return (
      process.env.HELIO_PAYLINK_ID_MAX ?? process.env.HELIO_PAYLINK_ID ?? ""
    );
  }
  return process.env.HELIO_PAYLINK_ID ?? "";
}

function planAmountCents(plan: PaidPlan): number {
  return plan === "max" ? MAX_MONTHLY_PRICE_CENTS : PLUS_MONTHLY_PRICE_CENTS;
}

export async function createHelioCheckout(
  userId: string,
  plan: PaidPlan = "plus",
): Promise<string> {
  const publicKey = process.env.HELIO_API_KEY;
  const secretKey = process.env.HELIO_SECRET_KEY;
  const paylinkId = helioPaylinkId(plan);

  if (!publicKey || !secretKey || !paylinkId) {
    throw new Error(
      "HELIO_API_KEY, HELIO_SECRET_KEY, and HELIO_PAYLINK_ID are required",
    );
  }

  const user = await getUser(userId);
  if (!user) throw new Error("User not found");

  const amount = (planAmountCents(plan) / 100).toFixed(2);
  const res = await fetch(
    `${HELIO_API_BASE}/charge/api-key?apiKey=${encodeURIComponent(publicKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secretKey}`,
      },
      body: JSON.stringify({
        paymentRequestId: paylinkId,
        requestAmount: amount,
        prepareRequestBody: {
          customerDetails: {
            email: user.email,
            additionalJSON: JSON.stringify({
              userId,
              kind: "prepaid_month",
              plan,
              returnUrl: `${getAppUrl()}/billing?success=1`,
            }),
          },
        },
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Helio charge failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { id?: string; pageUrl?: string };
  if (!data.pageUrl) {
    throw new Error("Helio did not return a checkout URL");
  }
  return data.pageUrl;
}

export function extractHelioUserId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;

  const direct =
    (typeof obj.userId === "string" && obj.userId) ||
    (typeof obj.user_id === "string" && obj.user_id) ||
    null;
  if (direct) return direct;

  const meta = obj.meta ?? obj.metadata ?? obj.additionalJSON;
  if (typeof meta === "string") {
    try {
      const parsed = JSON.parse(meta) as Record<string, unknown>;
      if (typeof parsed.userId === "string") return parsed.userId;
    } catch {
      /* ignore */
    }
  }
  if (meta && typeof meta === "object") {
    const m = meta as Record<string, unknown>;
    if (typeof m.userId === "string") return m.userId;
  }

  const customerDetails = obj.customerDetails;
  if (customerDetails && typeof customerDetails === "object") {
    const cd = customerDetails as Record<string, unknown>;
    if (typeof cd.additionalJSON === "string") {
      try {
        const parsed = JSON.parse(cd.additionalJSON) as Record<string, unknown>;
        if (typeof parsed.userId === "string") return parsed.userId;
      } catch {
        /* ignore */
      }
    }
  }

  const nested = obj.data ?? obj.transaction ?? obj.payment;
  if (nested && nested !== payload) {
    return extractHelioUserId(nested);
  }

  return null;
}

export function extractHelioPlan(payload: unknown): PaidPlan {
  const walk = (value: unknown): PaidPlan | null => {
    if (!value || typeof value !== "object") return null;
    const obj = value as Record<string, unknown>;
    if (obj.plan === "max" || obj.plan === "plus") return obj.plan;

    for (const key of [
      "meta",
      "metadata",
      "additionalJSON",
      "customerDetails",
      "data",
      "transaction",
      "payment",
    ]) {
      const child = obj[key];
      if (typeof child === "string") {
        try {
          const parsed = JSON.parse(child) as Record<string, unknown>;
          if (parsed.plan === "max" || parsed.plan === "plus")
            return parsed.plan;
        } catch {
          /* ignore */
        }
      } else {
        const found = walk(child);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(payload) ?? "plus";
}

export function extractHelioEventId(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["id", "transactionId", "paymentId", "eventId"]) {
      if (typeof obj[key] === "string") return `helio_${obj[key]}`;
    }
  }
  return `helio_${createHmac("sha256", "helio").update(JSON.stringify(payload)).digest("hex").slice(0, 32)}`;
}
