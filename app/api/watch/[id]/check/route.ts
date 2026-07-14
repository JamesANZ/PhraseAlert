import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/session";
import { runCheckForWatch } from "@/lib/check";
import { initDb } from "@/lib/db";
import { getWatch } from "@/lib/watches";

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

    initDb();
    const watch = getWatch(id, userId);
    if (!watch) {
      return NextResponse.json({ error: "Watch not found" }, { status: 404 });
    }

    if (watch.status !== "watching") {
      return NextResponse.json(
        {
          error: `Watch is ${watch.status}; only watching watches can be checked`,
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
