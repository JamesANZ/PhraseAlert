/**
 * @title POST /api/watch/[id]/check
 * @notice Manually run one check now for a watching watch (dev / dashboard "Check now").
 * @dev Full pipeline: Tavily retrieve → filter → detect → decide → persist.
 * @custom:auth Required session
 * @custom:env TAVILY_API_KEY
 */
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/session";
import { runCheckForWatch } from "@/lib/check";
import { initDb } from "@/lib/db";
import { getWatch } from "@/lib/watches";

/**
 * @notice Run check for one watch owned by the user.
 * @return 200 check summary with evidence | 404 | 409 non-watching | 503 no Tavily key
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUserId();
    const { id } = await params;

    if (!process.env.TAVILY_API_KEY) {
      return NextResponse.json(
        { error: "TAVILY_API_KEY is not configured" },
        { status: 503 },
      );
    }

    await initDb();
    const watch = await getWatch(id, userId);
    if (!watch) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    if (watch.status !== "watching") {
      return NextResponse.json(
        {
          error: `Alert is ${watch.status}; only active alerts can be checked`,
        },
        { status: 409 },
      );
    }

    const result = await runCheckForWatch(watch);

    return NextResponse.json({
      ok: true,
      watch_id: result.watchId,
      check_id: result.checkId,
      sources_retrieved: result.sourcesRetrieved,
      sources_evaluated: result.sourcesEvaluated,
      triggered: result.triggered,
      decision: {
        should_notify: result.decision.should_notify,
        top_verdict: result.decision.top_verdict,
        top_confidence: result.decision.top_confidence,
        needs_corroboration: result.decision.needs_corroboration,
        reasoning: result.decision.reasoning,
      },
      evidence: result.decision.evidence.map((e) => ({
        url: e.candidate.url,
        domain: e.candidate.domain,
        verdict: e.detection.verdict,
        confidence: e.detection.confidence,
        reasoning: e.detection.reasoning,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Check failed";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
