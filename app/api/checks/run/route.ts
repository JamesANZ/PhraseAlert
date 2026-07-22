/**
 * @title POST /api/checks/run
 * @notice Cron endpoint: run checks for all watches in `watching` status.
 * @dev Protected by Authorization: Bearer CRON_SECRET when CRON_SECRET is set.
 * @custom:env TAVILY_API_KEY, CRON_SECRET (optional)
 */
import { NextResponse } from "next/server";
import { runCheckForWatch } from "@/lib/check";
import { initDb } from "@/lib/db";
import { listWatchingWatches } from "@/lib/watches";

/**
 * @notice Batch check all active watches.
 * @return 200 { ok, checked, triggered, errors, results } | 401 bad cron secret | 503 no Tavily
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.TAVILY_API_KEY) {
    return NextResponse.json(
      { error: "TAVILY_API_KEY is not configured" },
      { status: 503 },
    );
  }

  await initDb();
  const watches = await listWatchingWatches();

  let triggered = 0;
  const errors: Array<{ watch_id: string; error: string }> = [];
  const results: Array<{
    watch_id: string;
    check_id: string;
    sources_retrieved: number;
    sources_evaluated: number;
    should_notify: boolean;
    top_verdict: string;
  }> = [];

  for (const watch of watches) {
    try {
      const result = await runCheckForWatch(watch);
      if (result.triggered) triggered += 1;
      results.push({
        watch_id: result.watchId,
        check_id: result.checkId,
        sources_retrieved: result.sourcesRetrieved,
        sources_evaluated: result.sourcesEvaluated,
        should_notify: result.decision.should_notify,
        top_verdict: result.decision.top_verdict,
      });
    } catch (err) {
      errors.push({
        watch_id: watch.id,
        error: err instanceof Error ? err.message : "Check failed",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: watches.length,
    triggered,
    errors,
    results,
  });
}
