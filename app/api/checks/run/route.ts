/**
 * @title GET|POST /api/checks/run
 * @notice Cron endpoint: run checks for `watching` watches that are due.
 * @dev Vercel Cron invokes every 15 minutes; due logic uses plan baseline/ceiling.
 *      Protected by Authorization: Bearer CRON_SECRET when CRON_SECRET is set.
 * @custom:env TAVILY_API_KEY, CRON_SECRET (optional)
 */
import { NextResponse } from "next/server";
import { CHECKS_CRON_TIME_BUDGET_MS } from "@/lib/constants";
import { getEffectivePlansForUsers } from "@/lib/billing/entitlements";
import { runCheckForWatch } from "@/lib/check";
import { initDb } from "@/lib/db";
import { isWatchDue } from "@/lib/monitoring-plan";
import { listWatchingWatches } from "@/lib/watches";

/**
 * @notice Batch check all due active watches within a time budget.
 * @return 200 { ok, checked, skipped, deferred, triggered, errors, results } | 401 | 503
 */
async function handle(request: Request) {
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

  const started = Date.now();
  await initDb();
  const allWatching = await listWatchingWatches();
  const now = new Date();
  const plans = await getEffectivePlansForUsers(
    allWatching.map((w) => w.userId),
    now.getTime(),
  );

  const due = allWatching.filter((watch) =>
    isWatchDue(watch, now, plans.get(watch.userId) ?? "free"),
  );
  const skipped = allWatching.length - due.length;

  let triggered = 0;
  let deferred = 0;
  const errors: Array<{ watch_id: string; error: string }> = [];
  const results: Array<{
    watch_id: string;
    check_id: string;
    sources_retrieved: number;
    sources_evaluated: number;
    should_notify: boolean;
    top_verdict: string;
  }> = [];

  for (const watch of due) {
    if (Date.now() - started > CHECKS_CRON_TIME_BUDGET_MS) {
      deferred = due.length - results.length - errors.length;
      break;
    }
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
    checked: results.length,
    skipped,
    deferred,
    triggered,
    errors,
    results,
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
