/**
 * @title POST /api/watch/confirm
 * @notice Finalize and persist a watch after the user has clarified a CLEAR sentence.
 * @dev Re-runs vagueness on clarified text, compiles WatchSpec, inserts watch row.
 * @custom:auth Required session
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserId } from "@/lib/auth/session";
import { assessVagueness, compileWatchSpec } from "@/lib/compiler";
import { createWatch } from "@/lib/watches";

const BodySchema = z.object({
  raw_input: z.string().trim().min(3).max(500),
  clarified_statement: z.string().trim().min(3).max(1000).optional(),
});

/**
 * @notice Compile and save watch.
 * @return 200 { watch } | 400 still VAGUE | 403 watch limit | 401 unauthorized
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = BodySchema.parse(await request.json());
    const clarified = body.clarified_statement ?? body.raw_input;

    const vagueness = await assessVagueness(clarified);
    if (vagueness.classification === "VAGUE") {
      return NextResponse.json(
        {
          error:
            "That watch is still too vague. Pick a more specific suggestion or rewrite it.",
          classification: "VAGUE",
          interpretations: vagueness.interpretations ?? [],
          reasoning: vagueness.reasoning,
        },
        { status: 400 },
      );
    }

    const spec = await compileWatchSpec(body.raw_input, {
      clarifiedStatement: clarified,
      userId,
      createdAt: new Date().toISOString(),
    });

    const watch = await createWatch(spec, userId);
    return NextResponse.json({ watch });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    const status =
      message.includes("Watch limit") || message.includes("Free tier")
        ? 403
        : 400;
    return NextResponse.json(
      {
        error: message,
        upgradeUrl: status === 403 ? "/billing" : undefined,
      },
      { status },
    );
  }
}
