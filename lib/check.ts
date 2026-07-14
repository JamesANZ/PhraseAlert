/**
 * @title Check orchestrator
 * @notice Runs one full retrieval → filter → detect → decide cycle for a single watch.
 * @dev Phase 1+2 bridge. Persists check and evidence rows; updates watch status on notification.
 * @custom:pipeline step 5 — check (orchestrates retrieve, filter, detect, decide)
 */
import {
  createCheck,
  createEvidence,
  listEvidenceUrlsForWatch,
} from "@/lib/checks";
import {
  decideFromEvidence,
  type DecideResult,
  type EvidenceRecord,
} from "@/lib/decide";
import { detectEvent } from "@/lib/detector";
import { applyRetrievalFilters } from "@/lib/filter";
import { retrieveCandidates } from "@/lib/retrieval";
import { updateWatchStatus, type WatchRow } from "@/lib/watches";

/** @dev Cap on candidates sent to the detector per check to control latency and inference cost. */
const MAX_CANDIDATES_TO_EVALUATE = 8;

/** @dev Summary returned to API routes and cron after a check completes. */
export interface CheckRunResult {
  watchId: string;
  checkId: string;
  sourcesRetrieved: number;
  sourcesEvaluated: number;
  decision: DecideResult;
  triggered: boolean;
  modelUsed: string | null;
}

/**
 * @notice Execute a scheduled or manual check for one watch.
 * @dev Skips already-seen URLs, evaluates up to MAX_CANDIDATES_TO_EVALUATE survivors, marks watch triggered when decision says notify.
 * @param watch WatchRow with embedded WatchSpec.
 * @return CheckRunResult with persisted check id and decision summary.
 */
export async function runCheckForWatch(
  watch: WatchRow,
): Promise<CheckRunResult> {
  const retrievedAt = new Date().toISOString();
  const seenUrls = listEvidenceUrlsForWatch(watch.id);

  const retrieved = await retrieveCandidates(watch.spec, { retrievedAt });
  const filtered = applyRetrievalFilters(
    retrieved,
    watch.createdAt || watch.spec.created_at,
    seenUrls,
  ).slice(0, MAX_CANDIDATES_TO_EVALUATE);

  const evidenceRecords: EvidenceRecord[] = [];
  let modelUsed: string | null = null;

  for (const candidate of filtered) {
    const detection = await detectEvent(watch.spec, candidate);
    modelUsed = detection.model;
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

  const decision = decideFromEvidence(watch.spec, evidenceRecords);

  const checkId = createCheck({
    watchId: watch.id,
    sourcesRetrieved: retrieved.length,
    sourcesEvaluated: evidenceRecords.length,
    verdict: decision.top_verdict,
    confidence: decision.top_confidence,
    modelUsed,
    escalated: decision.needs_corroboration,
  });

  createEvidence(
    checkId,
    evidenceRecords.map((e) => ({
      url: e.candidate.url,
      domain: e.candidate.domain,
      publishedAt: e.candidate.published_at,
      snippet: e.candidate.snippet.slice(0, 2000),
      verdict: e.detection.verdict,
      reasoning: e.detection.reasoning,
    })),
  );

  let triggered = false;
  if (decision.should_notify && watch.status === "watching") {
    updateWatchStatus(watch.id, watch.userId, "triggered");
    triggered = true;
  }

  return {
    watchId: watch.id,
    checkId,
    sourcesRetrieved: retrieved.length,
    sourcesEvaluated: evidenceRecords.length,
    decision,
    triggered,
    modelUsed,
  };
}
