/**
 * @title POST /api/watch/create
 * @notice Assess vagueness of a watch sentence before saving (clarification step).
 * @dev Does not persist a watch. Returns VaguenessResult for the WatchCreator UI.
 * @custom:auth Required session
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth/session";
import { assessVagueness } from "@/lib/compiler";

/** @dev Request body: raw_input 3–500 chars. */
const BodySchema = z.object({
  raw_input: z.string().trim().min(3).max(500),
});

/**
 * @notice Run vagueness classification on raw_input.
 * @return 200 VaguenessResult | 401 unauthorized | 400 validation error
 */
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
