import { db } from "@/lib/db";
import { checks, evidence } from "@/lib/db/schema";
import { normalizeUrl } from "@/lib/filter";
import { eq, inArray } from "drizzle-orm";

export interface CreateCheckInput {
  watchId: string;
  sourcesRetrieved: number;
  sourcesEvaluated: number;
  verdict: string | null;
  confidence: number | null;
  modelUsed: string | null;
  escalated?: boolean;
}

export interface CreateEvidenceInput {
  url: string;
  domain: string;
  publishedAt: string | null;
  snippet: string | null;
  verdict: string | null;
  reasoning: string | null;
}

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

/** Normalized URLs previously stored as evidence for any check on this watch. */
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
