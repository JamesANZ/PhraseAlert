import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth/session";
import { compileWatchSpec } from "@/lib/compiler";
import { createWatch } from "@/lib/watches";

const BodySchema = z.object({
  raw_input: z.string().trim().min(3).max(500),
  clarified_statement: z.string().trim().min(3).max(1000).optional(),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = BodySchema.parse(await request.json());
    const clarified = body.clarified_statement ?? body.raw_input;

    const spec = await compileWatchSpec(body.raw_input, {
      clarifiedStatement: clarified,
      userId,
      createdAt: new Date().toISOString(),
    });

    const watch = createWatch(spec, userId);
    return NextResponse.json({ watch });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    const status = message.includes("Free tier") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
