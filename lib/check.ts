/**
 * @title Check orchestrator
 * @notice Runs a retrieval → filter → detect → decide cycle for a single watch,
 *         with up to one extra AI-directed round (backup searches and/or page
 *         re-checks) when the first round is inconclusive.
 * @dev Persists check and evidence rows; updates watch status and plan state.
 * @custom:pipeline step 5 — check (orchestrates retrieve, filter, detect, decide, plan)
 */
import {
  getEffectivePlan,
  getUser,
  planAllowsSms,
} from "@/lib/billing/entitlements";
import {
  createCheck,
  createEvidence,
  listEvidenceUrlsForWatch,
  updateCheckFindingsSummary,
} from "@/lib/checks";
import {
  decideFromEvidence,
  type DecideResult,
  type EvidenceRecord,
} from "@/lib/decide";
import { detectEvent } from "@/lib/detector";
import { applyRetrievalFilters, normalizeUrl } from "@/lib/filter";
import { buildFindingsForNotify } from "@/lib/findings";
import {
  clampRecheckHours,
  decideNextAction,
  filterRevisitUrls,
  planForSpec,
  planStateForSpec,
  recordRevisits,
} from "@/lib/monitoring-plan";
import { sendWatchTriggeredEmail } from "@/lib/notifications/email";
import { sendWatchTriggeredSms } from "@/lib/notifications/sms";
import { retrieveByUrls, retrieveCandidates } from "@/lib/retrieval";
import {
  updateWatchPlanState,
  updateWatchStatus,
  type WatchRow,
} from "@/lib/watches";
import type { NextAction, PlanRuntimeState } from "@/types";

/** @dev Cap on candidates judged in the first round, to control latency and inference cost. */
const MAX_CANDIDATES_TO_EVALUATE = 8;
/** @dev Cap on extra candidates judged in the AI-requested follow-up round. */
const MAX_FOLLOW_UP_CANDIDATES = 4;

/** @dev Summary returned to API routes and cron after a check completes. */
export interface CheckRunResult {
  watchId: string;
  checkId: string;
  sourcesRetrieved: number;
  sourcesEvaluated: number;
  decision: DecideResult;
  triggered: boolean;
  modelUsed: string | null;
  /** @dev True when the AI ran a second retrieval round within this check. */
  followUpRan: boolean;
}

/**
 * @notice Execute a scheduled or manual check for one watch.
 * @dev Round 1 runs the plan's baseline queries (plus any follow-up work the AI
 *      queued on a previous run). If the result is inconclusive, the AI may run
 *      one bounded extra round now and/or schedule a recheck. Notification rules
 *      in decideFromEvidence are unchanged.
 * @param watch WatchRow with embedded WatchSpec.
 * @return CheckRunResult with persisted check id and decision summary.
 */
export async function runCheckForWatch(
  watch: WatchRow,
): Promise<CheckRunResult> {
  const spec = watch.spec;
  const now = new Date().toISOString();
  const watchCreatedAt = watch.createdAt || spec.created_at;

  const plan = planForSpec(spec);
  let planState = planStateForSpec(spec);
  const pending = planState.pending_follow_up
    ? planState.pending_actions
    : null;

  const seenUrls = await listEvidenceUrlsForWatch(watch.id);
  const evaluatedThisRun = new Set<string>();
  const evidenceRecords: EvidenceRecord[] = [];
  let sourcesRetrieved = 0;
  let modelUsed: string | null = null;

  /** Retrieve, filter, and judge one round; appends to evidenceRecords. */
  async function runRound(
    queries: string[],
    revisitUrls: string[],
    maxCandidates: number,
  ): Promise<void> {
    const [searched, revisited] = await Promise.all([
      queries.length > 0
        ? retrieveCandidates(spec, { queries, retrievedAt: now })
        : Promise.resolve([]),
      retrieveByUrls(spec, revisitUrls),
    ]);
    sourcesRetrieved += searched.length + revisited.length;

    // Seen URLs from prior checks (and earlier this run) are excluded, except
    // the specific pages the plan approved for a re-check.
    const alreadySeen = new Set([...seenUrls, ...evaluatedThisRun]);
    const allowSeen = new Set(revisitUrls.map((u) => normalizeUrl(u)));
    for (const url of evaluatedThisRun) allowSeen.delete(url);

    const filtered = applyRetrievalFilters(
      [...revisited, ...searched],
      watchCreatedAt,
      alreadySeen,
      [],
      allowSeen,
    ).slice(0, maxCandidates);

    for (const candidate of filtered) {
      const detection = await detectEvent(spec, candidate);
      modelUsed = detection.model;
      evaluatedThisRun.add(normalizeUrl(candidate.url));
      evidenceRecords.push({
        candidate,
        detection: {
          verdict: detection.verdict,
          confidence: detection.confidence,
          reasoning: detection.reasoning,
          event_date_claimed: detection.event_date_claimed,
        },
      });
    }
  }

  // Round 1: baseline queries, plus whatever the AI queued on a previous run.
  const round1Queries =
    pending?.use_follow_up_queries && plan.follow_up_queries.length > 0
      ? [...new Set([...plan.baseline_queries, ...plan.follow_up_queries])]
      : plan.baseline_queries;
  const round1Revisits = filterRevisitUrls(
    plan,
    planState,
    pending?.revisit_urls ?? [],
    seenUrls,
  );
  planState = recordRevisits(planState, round1Revisits, now);
  const followUpsUsedInRound1 =
    Boolean(pending?.use_follow_up_queries) &&
    plan.follow_up_queries.length > 0;

  await runRound(round1Queries, round1Revisits, MAX_CANDIDATES_TO_EVALUATE);
  let decision = decideFromEvidence(spec, evidenceRecords);

  // Ask the AI what to do next; optionally run one bounded extra round now.
  let nextAction: NextAction | null = null;
  let followUpRan = false;

  if (!decision.should_notify) {
    const eligibleRevisitUrls = filterRevisitUrls(
      plan,
      planState,
      [...seenUrls],
      seenUrls,
    );

    nextAction = await decideNextAction({
      spec,
      plan,
      decision,
      evidence: evidenceRecords,
      eligibleRevisitUrls,
      followUpQueriesAvailable: !followUpsUsedInRound1,
      now,
    });

    if (nextAction.action === "dig_deeper") {
      const round2Queries = nextAction.use_follow_up_queries
        ? plan.follow_up_queries
        : [];
      const round2Revisits = filterRevisitUrls(
        plan,
        planState,
        nextAction.revisit_urls,
        seenUrls,
      ).filter((u) => !evaluatedThisRun.has(normalizeUrl(u)));

      if (round2Queries.length > 0 || round2Revisits.length > 0) {
        planState = recordRevisits(planState, round2Revisits, now);
        await runRound(round2Queries, round2Revisits, MAX_FOLLOW_UP_CANDIDATES);
        decision = decideFromEvidence(spec, evidenceRecords);
        followUpRan = true;
      }
    }
  }

  const checkId = await createCheck({
    watchId: watch.id,
    sourcesRetrieved,
    sourcesEvaluated: evidenceRecords.length,
    verdict: decision.top_verdict,
    confidence: decision.top_confidence,
    modelUsed,
    escalated: decision.needs_corroboration,
    decideReasoning: decision.reasoning,
  });

  await createEvidence(
    checkId,
    evidenceRecords.map((e) => ({
      url: e.candidate.url,
      domain: e.candidate.domain,
      title: e.candidate.title,
      publishedAt: e.candidate.published_at,
      snippet: e.candidate.snippet.slice(0, 2000),
      verdict: e.detection.verdict,
      confidence: e.detection.confidence,
      reasoning: e.detection.reasoning,
    })),
  );

  let triggered = false;
  if (decision.should_notify && watch.status === "watching") {
    const findings = await buildFindingsForNotify({
      watchId: watch.id,
      checkId,
      rawInput: watch.rawInput,
      clarified: spec.clarified_statement,
      decision,
    });
    await updateCheckFindingsSummary(checkId, findings.summary);

    const user = await getUser(watch.userId);
    if (user?.email) {
      try {
        await sendWatchTriggeredEmail(user.email, findings);
      } catch (err) {
        console.error("[notify] failed to send watch email", {
          watchId: watch.id,
          userId: watch.userId,
          err,
        });
      }
    } else {
      console.warn("[notify] no email for user; skip watch email", {
        watchId: watch.id,
        userId: watch.userId,
      });
    }

    if (user && planAllowsSms(getEffectivePlan(user)) && user.phoneE164) {
      try {
        await sendWatchTriggeredSms(user.phoneE164, findings);
      } catch (err) {
        console.error("[notify] failed to send watch SMS", {
          watchId: watch.id,
          userId: watch.userId,
          err,
        });
      }
    }

    await updateWatchStatus(watch.id, watch.userId, "triggered");
    triggered = true;
  }

  // Save plan state for the next run: last-run time, re-check budgets, and any
  // follow-up the AI queued (which may make the watch due before baseline).
  const newState: PlanRuntimeState = {
    ...planState,
    last_check_at: now,
    pending_follow_up: false,
    next_eligible_at: null,
    pending_actions: null,
    planner_note: nextAction ? nextAction.reasoning.slice(0, 500) : null,
  };

  if (!triggered && nextAction && nextAction.recheck_after_hours != null) {
    const userForPlan = await getUser(watch.userId);
    const effectivePlan = userForPlan ? getEffectivePlan(userForPlan) : "free";
    const recheckHours = clampRecheckHours(
      nextAction.recheck_after_hours,
      effectivePlan,
    );
    const revisitUrls = filterRevisitUrls(
      plan,
      newState,
      nextAction.revisit_urls,
      seenUrls,
    );
    newState.pending_follow_up = true;
    newState.next_eligible_at = new Date(
      Date.parse(now) + recheckHours * 3600_000,
    ).toISOString();
    newState.pending_actions = {
      use_follow_up_queries:
        nextAction.use_follow_up_queries && plan.follow_up_queries.length > 0,
      revisit_urls: revisitUrls,
    };
  }

  try {
    await updateWatchPlanState(watch.id, watch.userId, newState);
  } catch (err) {
    console.error("[plan] failed to persist plan state", {
      watchId: watch.id,
      err,
    });
  }

  return {
    watchId: watch.id,
    checkId,
    sourcesRetrieved,
    sourcesEvaluated: evidenceRecords.length,
    decision,
    triggered,
    modelUsed,
    followUpRan,
  };
}
