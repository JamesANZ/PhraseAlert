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

/** @dev Normalize Tavily published_date to ISO; falls back to retrievedAt when missing or invalid. */
function toIsoDate(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;

  const trimmed = value.trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00.000Z`).toISOString();
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return fallback;
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

/**
 * @notice Retrieve web candidates for a watch using its compiled search_queries.
 * @dev Merges search results, optionally enriches top URLs via extract, returns RetrievalCandidate[].
 * @param spec WatchSpec with search_queries and created_at.
 * @param options.retrievedAt Fallback published_at when Tavily omits dates.
 * @return Deduplicated candidates ready for applyRetrievalFilters.
 */
export async function retrieveCandidates(
  spec: WatchSpec,
  options: { retrievedAt?: string } = {},
): Promise<RetrievalCandidate[]> {
  const retrievedAt = options.retrievedAt ?? new Date().toISOString();
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
      if (!byUrl.has(key)) {
        byUrl.set(key, result);
      }
    }
  }

  const uniqueResults = [...byUrl.values()];
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

  return uniqueResults.map((result) => {
    const key = normalizeUrl(result.url);
    const extracted = extractedByUrl.get(key);
    const snippet = truncateSnippet(
      extracted || result.content || result.title || "",
    );

    return {
      url: result.url,
      domain: domainFromUrl(result.url),
      title: result.title || result.url,
      snippet,
      published_at: toIsoDate(result.published_date, retrievedAt),
      retrieval_source: "tavily" as const,
    };
  });
}
