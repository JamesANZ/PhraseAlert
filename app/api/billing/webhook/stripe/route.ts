import { NextResponse } from "next/server";
import { handleStripeWebhook } from "@/lib/billing/stripe-webhook";
import { initDb } from "@/lib/db";

export async function POST(request: Request) {
  try {
    initDb();
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json(
        { error: "Missing stripe-signature" },
        { status: 400 },
      );
    }
    const rawBody = await request.text();
    await handleStripeWebhook(rawBody, signature);
    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook failed";
    console.error("[stripe webhook]", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
