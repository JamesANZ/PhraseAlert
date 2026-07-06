import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth/session";
import { assessVagueness } from "@/lib/compiler";

const BodySchema = z.object({
  raw_input: z.string().trim().min(3).max(500),
});

export async function POST(request: Request) {
  try {
    await requireUserId();
    const body = BodySchema.parse(await request.json());
    const vagueness = await assessVagueness(body.raw_input);
    return NextResponse.json(vagueness);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    const status = message.includes("Free tier") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
