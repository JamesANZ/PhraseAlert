import { NextResponse } from "next/server";
import { handleHelioWebhook } from "@/lib/billing/helio-webhook";
import { initDb } from "@/lib/db";

export async function POST(request: Request) {
  try {
    await initDb();
    const rawBody = await request.text();
    await handleHelioWebhook(rawBody, request);
    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook failed";
    console.error("[helio webhook]", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
