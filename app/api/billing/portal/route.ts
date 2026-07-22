import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/session";
import { createCustomerPortal } from "@/lib/billing/stripe";
import { initDb } from "@/lib/db";

export async function POST() {
  try {
    await initDb();
    const userId = await requireUserId();
    const url = await createCustomerPortal(userId);
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Portal failed";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
