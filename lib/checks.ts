/**
 * @title Check and evidence persistence
 * @notice Records each check run and per-source evidence for audit trails and URL deduplication.
 * @dev Phase 2. Confidence stored as 0–100 integer in SQLite; evidence snippets truncated at insert.
 */
import { db } from "@/lib/db";
import { checks, evidence } from "@/lib/db/schema";
import { normalizeUrl } from "@/lib/filter";
import { eq, inArray } from "drizzle-orm";

/** @dev Input for inserting one check row after decide completes. */
export interface CreateCheckInput {
  watchId: string;
  sourcesRetrieved: number;
  sourcesEvaluated: number;
  verdict: string | null;
  confidence: number | null;
  modelUsed: string | null;
  escalated?: boolean;
}

/** @dev One evidence row linked to a check (one evaluated URL). */
export interface CreateEvidenceInput {
  url: string;
  domain: string;
  publishedAt: string | null;
  snippet: string | null;
  verdict: string | null;
  reasoning: string | null;
}

/**
 * @notice Insert a check record and return its id.
 * @dev Id format: `chk_<uuid12>`. Confidence clamped to [0,1] then stored as percent.
 * @param input Aggregated check metadata.
 * @return New check id.
 */
export function createCheck(input: CreateCheckInput): string {
  const id = `chk_${crypto.randomUUID().slice(0, 12)}`;
  const confidence =
    input.confidence == null
      ? null
      : Math.round(Math.min(1, Math.max(0, input.confidence)) * 100);

  db.insert(checks)
    .values({
      id,
      watchId: input.watchId,
      ranAt: new Date().toISOString(),
      sourcesRetrieved: input.sourcesRetrieved,
      sourcesEvaluated: input.sourcesEvaluated,
      verdict: input.verdict,
      confidence,
      modelUsed: input.modelUsed,
      escalated: input.escalated ?? false,
      costCents: 0,
    })
    .run();

  return id;
}

/**
 * @notice Bulk-insert evidence rows for a check.
 * @param checkId Parent check id from createCheck.
 * @param rows Per-candidate detection outcomes.
 */
export function createEvidence(
  checkId: string,
  rows: CreateEvidenceInput[],
): void {
  if (rows.length === 0) return;

  for (const row of rows) {
    db.insert(evidence)
      .values({
        id: `ev_${crypto.randomUUID().slice(0, 12)}`,
        checkId,
        url: row.url,
        domain: row.domain,
        publishedAt: row.publishedAt,
        snippet: row.snippet,
        verdict: row.verdict,
        reasoning: row.reasoning,
      })
      .run();
  }
}

/**
 * @notice Normalized URLs previously stored as evidence for any check on this watch.
 * @dev Used by applyRetrievalFilters to skip re-judging the same article.
 * @param watchId Watch id.
 * @return Set of normalized URLs.
 */
export function listEvidenceUrlsForWatch(watchId: string): Set<string> {
  const checkIds = db
    .select({ id: checks.id })
    .from(checks)
    .where(eq(checks.watchId, watchId))
    .all()
    .map((r) => r.id);

  const urls = new Set<string>();
  if (checkIds.length === 0) return urls;

  const rows = db
    .select({ url: evidence.url })
    .from(evidence)
    .where(inArray(evidence.checkId, checkIds))
    .all();

  for (const row of rows) {
    urls.add(normalizeUrl(row.url));
  }
  return urls;
}
