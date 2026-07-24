/**
 * @title Live retrieval orchestrator
 * @notice Runs Tavily search and extract for a WatchSpec's search_queries and builds RetrievalCandidates.
 * @dev Phase 2. Constrains results to post-watch window via Tavily start_date; dedupes by normalized URL.
 * @custom:pipeline step 2 — retrieve
 * @custom:env TAVILY_API_KEY
 */
import { normalizeUrl } from "@/lib/filter";
import type { RetrievalCandidate, WatchSpec } from "@/types";
import { tavilyExtract, tavilySearch, type TavilySearchResult } from "./tavily";

/** @dev Max Tavily search hits per query before merge. */
const MAX_RESULTS_PER_QUERY = 5;
/** @dev Top unique URLs sent to Tavily extract for richer snippets. */
const MAX_EXTRACT_URLS = 5;
/** @dev Parallel Tavily search calls (one per search_query). */
const SEARCH_CONCURRENCY = 2;

/** @dev Hostname without www prefix; "unknown" on parse failure. */
function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

/**
 * @dev Normalize Tavily published_date to ISO.
 * @return ISO string, or null when missing/invalid (undated candidates are dropped).
 */
function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00.000Z`).toISOString();
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return null;
}

/** @dev YYYY-MM-DD slice of watch created_at for Tavily start_date filter. */
function startDateFromCreatedAt(createdAt: string): string | undefined {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

/** @dev Bounded-concurrency map for parallel Tavily searches. */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

/** @dev Collapse whitespace and cap snippet length for detector prompts. */
function truncateSnippet(text: string, max = 2500): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

/** Live tickers/dashboards rarely confirm a discrete watched event. */
function looksLikeLiveDashboard(title: string, url: string): boolean {
  const hay = `${title} ${url}`.toLowerCase();
  return /price today|live (?:price|chart|score|quotes?)|current (?:price|value)|btc to usd live|live bitcoin chart/.test(
    hay,
  );
}

/**
 * @notice Retrieve web candidates for a watch using its compiled search_queries.
 * @dev Merges search results, optionally enriches top URLs via extract, returns RetrievalCandidate[].
 * @param spec WatchSpec with search_queries and created_at.
 * @param options.retrievedAt Reserved for callers; undated hits are dropped (no now-fallback).
 * @return Deduplicated candidates ready for applyRetrievalFilters.
 */
export async function retrieveCandidates(
  spec: WatchSpec,
  options: { retrievedAt?: string } = {},
): Promise<RetrievalCandidate[]> {
  void options.retrievedAt;
  const startDate = startDateFromCreatedAt(spec.created_at);

  const searchBatches = await mapPool(
    spec.search_queries,
    SEARCH_CONCURRENCY,
    async (query) => {
      const response = await tavilySearch(query, {
        maxResults: MAX_RESULTS_PER_QUERY,
        searchDepth: "basic",
        startDate,
      });
      return response.results ?? [];
    },
  );

  const byUrl = new Map<string, TavilySearchResult>();
  for (const batch of searchBatches) {
    for (const result of batch) {
      if (!result?.url) continue;
      const key = normalizeUrl(result.url);
      const existing = byUrl.get(key);
      // Keep the higher-scoring duplicate when the same URL appears across queries.
      if (!existing || (result.score ?? 0) > (existing.score ?? 0)) {
        byUrl.set(key, result);
      }
    }
  }

  // Rank by Tavily relevance so extract + judge see event pages, not live dashboards first.
  const uniqueResults = [...byUrl.values()].sort((a, b) => {
    const dashA = looksLikeLiveDashboard(a.title || "", a.url) ? 1 : 0;
    const dashB = looksLikeLiveDashboard(b.title || "", b.url) ? 1 : 0;
    if (dashA !== dashB) return dashA - dashB;
    return (b.score ?? 0) - (a.score ?? 0);
  });
  const extractUrls = uniqueResults
    .slice(0, MAX_EXTRACT_URLS)
    .map((r) => r.url);

  const extractedByUrl = new Map<string, string>();
  if (extractUrls.length > 0) {
    try {
      const extracted = await tavilyExtract(extractUrls, {
        query: spec.clarified_statement,
        chunksPerSource: 3,
        extractDepth: "basic",
      });
      for (const item of extracted.results ?? []) {
        if (item.url && item.raw_content) {
          extractedByUrl.set(normalizeUrl(item.url), item.raw_content);
        }
      }
    } catch {
      // Search snippets alone are enough to continue judging.
    }
  }

  const candidates: RetrievalCandidate[] = [];
  for (const result of uniqueResults) {
    const publishedAt = toIsoDate(result.published_date);
    if (!publishedAt) continue;

    const key = normalizeUrl(result.url);
    const extracted = extractedByUrl.get(key);
    const snippet = truncateSnippet(
      extracted || result.content || result.title || "",
    );

    candidates.push({
      url: result.url,
      domain: domainFromUrl(result.url),
      title: result.title || result.url,
      snippet,
      published_at: publishedAt,
      retrieval_source: "tavily" as const,
    });
  }
  return candidates;
}
