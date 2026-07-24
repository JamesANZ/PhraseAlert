/**
 * @title Check and evidence persistence
 * @notice Records each check run and per-source evidence for audit trails and URL deduplication.
 * @dev Phase 2. Confidence stored as 0–100 integer; evidence snippets truncated at insert.
 */
import { db } from "@/lib/db";
import { checks, evidence } from "@/lib/db/schema";
import { normalizeUrl } from "@/lib/filter";
import {
  fallbackFindingsSummary,
  type FindingsSource,
  type WatchFindings,
} from "@/lib/findings";
import type { WatchRow } from "@/lib/watches";
import { and, desc, eq, inArray } from "drizzle-orm";

/** @dev Input for inserting one check row after decide completes. */
export interface CreateCheckInput {
  watchId: string;
  sourcesRetrieved: number;
  sourcesEvaluated: number;
  verdict: string | null;
  confidence: number | null;
  modelUsed: string | null;
  escalated?: boolean;
  decideReasoning?: string | null;
  findingsSummary?: string | null;
}

/** @dev One evidence row linked to a check (one evaluated URL). */
export interface CreateEvidenceInput {
  url: string;
  domain: string;
  title?: string | null;
  publishedAt: string | null;
  snippet: string | null;
  verdict: string | null;
  confidence?: number | null;
  reasoning: string | null;
}

/**
 * @notice Insert a check record and return its id.
 * @dev Id format: `chk_<uuid12>`. Confidence clamped to [0,1] then stored as percent.
 * @param input Aggregated check metadata.
 * @return New check id.
 */
export async function createCheck(input: CreateCheckInput): Promise<string> {
  const id = `chk_${crypto.randomUUID().slice(0, 12)}`;
  const confidence =
    input.confidence == null
      ? null
      : Math.round(Math.min(1, Math.max(0, input.confidence)) * 100);

  await db.insert(checks).values({
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
    decideReasoning: input.decideReasoning ?? null,
    findingsSummary: input.findingsSummary ?? null,
  });

  return id;
}

/**
 * @notice Persist a model-written findings summary onto an existing check.
 */
export async function updateCheckFindingsSummary(
  checkId: string,
  findingsSummary: string,
): Promise<void> {
  await db
    .update(checks)
    .set({ findingsSummary })
    .where(eq(checks.id, checkId));
}

/**
 * @notice Bulk-insert evidence rows for a check.
 * @param checkId Parent check id from createCheck.
 * @param rows Per-candidate detection outcomes.
 */
export async function createEvidence(
  checkId: string,
  rows: CreateEvidenceInput[],
): Promise<void> {
  if (rows.length === 0) return;

  await db.insert(evidence).values(
    rows.map((row) => ({
      id: `ev_${crypto.randomUUID().slice(0, 12)}`,
      checkId,
      url: row.url,
      domain: row.domain,
      title: row.title ?? null,
      publishedAt: row.publishedAt,
      snippet: row.snippet,
      verdict: row.verdict,
      confidence:
        row.confidence == null
          ? null
          : Math.round(Math.min(1, Math.max(0, row.confidence)) * 100),
      reasoning: row.reasoning,
    })),
  );
}

/**
 * @notice Normalized URLs previously stored as evidence for any check on this watch.
 * @dev Used by applyRetrievalFilters to skip re-judging the same article.
 * @param watchId Watch id.
 * @return Set of normalized URLs.
 */
export async function listEvidenceUrlsForWatch(
  watchId: string,
): Promise<Set<string>> {
  const checkIds = (
    await db
      .select({ id: checks.id })
      .from(checks)
      .where(eq(checks.watchId, watchId))
  ).map((r) => r.id);

  const urls = new Set<string>();
  if (checkIds.length === 0) return urls;

  const rows = await db
    .select({ url: evidence.url })
    .from(evidence)
    .where(inArray(evidence.checkId, checkIds));

  for (const row of rows) {
    urls.add(normalizeUrl(row.url));
  }
  return urls;
}

function mapEvidenceRow(row: typeof evidence.$inferSelect): FindingsSource {
  return {
    url: row.url,
    domain: row.domain,
    title: row.title || row.domain,
    snippet: row.snippet ?? "",
    confidence: row.confidence == null ? null : row.confidence / 100,
    reasoning: row.reasoning ?? "",
    publishedAt: row.publishedAt,
  };
}

/**
 * @notice Load the latest triggered check (or latest check) and its TRIGGERED evidence for the UI/email.
 * @dev Falls back to a composed summary when findings_summary was never stored (pre-feature checks).
 */
export async function getWatchFindings(
  watch: WatchRow,
): Promise<WatchFindings | null> {
  const triggeredChecks = await db
    .select()
    .from(checks)
    .where(and(eq(checks.watchId, watch.id), eq(checks.verdict, "TRIGGERED")))
    .orderBy(desc(checks.ranAt))
    .limit(1);

  let check = triggeredChecks[0];
  if (!check) {
    const latest = await db
      .select()
      .from(checks)
      .where(eq(checks.watchId, watch.id))
      .orderBy(desc(checks.ranAt))
      .limit(1);
    check = latest[0];
  }

  if (!check) return null;

  const evidenceRows = await db
    .select()
    .from(evidence)
    .where(eq(evidence.checkId, check.id));

  const triggeredSources = evidenceRows
    .filter((row) => row.verdict === "TRIGGERED")
    .map(mapEvidenceRow)
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  const sources =
    triggeredSources.length > 0
      ? triggeredSources
      : evidenceRows.map(mapEvidenceRow);

  const decideReasoning =
    check.decideReasoning?.trim() ||
    (sources.length >= 2
      ? "Corroborated by multiple independent triggered sources."
      : sources[0]
        ? `Evidence from ${sources[0].domain} matched your watch.`
        : check.verdict === "TRIGGERED"
          ? "Confirmed match from stored check evidence."
          : check.verdict
            ? `Latest check verdict: ${check.verdict}.`
            : "No triggered verdict stored for this alert yet.");

  const summary =
    check.findingsSummary?.trim() ||
    fallbackFindingsSummary(decideReasoning, sources);

  return {
    watchId: watch.id,
    checkId: check.id,
    rawInput: watch.rawInput,
    clarified: watch.spec.clarified_statement,
    decideReasoning,
    summary,
    confidence: check.confidence == null ? null : check.confidence / 100,
    triggeredAt: watch.triggeredAt ?? check.ranAt,
    sources,
  };
}
