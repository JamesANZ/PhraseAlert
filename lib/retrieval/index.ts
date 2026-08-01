/**
 * @title Live retrieval orchestrator
 * @notice Runs Tavily search and extract for a WatchSpec's search_queries and builds RetrievalCandidates.
 * @dev Phase 2. Dedupes by normalized URL. Does NOT pass Tavily start_date — that filter
 *      silently drops undated live/official pages that often hold the confirmation. Temporal
 *      safety stays in applyRetrievalFilters + decide (event_date_claimed).
 *      Cost: "baseline" uses cheap 1-credit searches (news-only, capped queries, conditional
 *      site:); "deep" keeps dual-topic advanced searches for dig-deeper / follow-up rounds.
 * @custom:pipeline step 2 — retrieve
 * @custom:env TAVILY_API_KEY
 */
import { normalizeUrl } from "@/lib/filter";
import type { RetrievalCandidate, WatchSpec } from "@/types";
import { tavilyExtract, tavilySearch, type TavilySearchResult } from "./tavily";

/** @dev Quiet check vs dig-deeper / AI follow-up. Controls Tavily credit spend. */
export type RetrievalMode = "baseline" | "deep";

/** @dev Max Tavily search hits per query before merge. */
const MAX_RESULTS_PER_QUERY = 5;
/** @dev Top unique URLs considered for Tavily extract. */
const MAX_EXTRACT_URLS = 5;
/** @dev Parallel Tavily search calls (one per search_query × topic). */
const SEARCH_CONCURRENCY = 3;
/** @dev Baseline: cap queries so quiet checks stay cheap. */
const BASELINE_MAX_QUERIES = 2;
/** @dev Deep: allow the full plan budget. */
const DEEP_MAX_QUERIES = 4;
/** @dev Skip extract when search already returned a usable snippet (chars). */
const MIN_SNIPPET_SKIP_EXTRACT = 500;

type SearchTopic = "general" | "news";

interface ModePolicy {
  searchDepth: "basic" | "advanced";
  topics: SearchTopic[];
  maxQueries: number;
  /** @dev Max site: searches when open results miss authoritative domains. */
  maxSiteSearches: number;
  /** @dev When true, always schedule site: searches (deep). */
  alwaysSiteSearch: boolean;
  /** @dev When true, extract only URLs whose search content is thin. */
  skipExtractWhenRich: boolean;
}

const MODE_POLICY: Record<RetrievalMode, ModePolicy> = {
  baseline: {
    searchDepth: "basic",
    topics: ["news"],
    maxQueries: BASELINE_MAX_QUERIES,
    maxSiteSearches: 1,
    alwaysSiteSearch: false,
    skipExtractWhenRich: true,
  },
  deep: {
    searchDepth: "advanced",
    topics: ["general", "news"],
    maxQueries: DEEP_MAX_QUERIES,
    maxSiteSearches: 3,
    alwaysSiteSearch: true,
    skipExtractWhenRich: false,
  },
};

/** @dev Hostname without www prefix; "unknown" on parse failure. */
function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

/**
 * @dev Keep one prolific domain from consuming every bounded detector slot.
 *      Results are already relevance-ranked; defer only entries beyond the
 *      per-domain allowance, then append them so no result is discarded.
 */
export function diversifyResultsByDomain<T extends { url: string }>(
  ranked: T[],
  maxPerDomain = 2,
): T[] {
  const selected: T[] = [];
  const deferred: T[] = [];
  const counts = new Map<string, number>();

  for (const result of ranked) {
    const domain = domainFromUrl(result.url);
    const count = counts.get(domain) ?? 0;
    if (count < maxPerDomain) {
      selected.push(result);
      counts.set(domain, count + 1);
    } else {
      deferred.push(result);
    }
  }

  return [...selected, ...deferred];
}

/**
 * @dev Normalize Tavily published_date to ISO.
 * @return ISO string, or retrievedAt when missing/invalid so undated news and
 *         official live pages still reach the detector (decide still requires a
 *         post-watch event_date_claimed before notifying).
 */
export function toIsoDate(
  value: string | null | undefined,
  retrievedAt?: string,
): string | null {
  if (value) {
    const trimmed = value.trim();
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const d = new Date(`${trimmed}T00:00:00.000Z`);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  if (retrievedAt) {
    const fallback = new Date(retrievedAt);
    if (!Number.isNaN(fallback.getTime())) return fallback.toISOString();
  }

  return null;
}

/** @dev Infer a publish date from common CMS URL patterns when Tavily omits it. */
export function publishedDateFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    // /2026/07/25/ or /2026-07-25/
    const dashed = path.match(/\/(20\d{2})\/(\d{2})\/(\d{2})(?:\/|$)/);
    if (dashed) {
      return toIsoDate(`${dashed[1]}-${dashed[2]}-${dashed[3]}`);
    }
    const compact = path.match(/\/(20\d{2})-(\d{2})-(\d{2})(?:\/|$)/);
    if (compact) {
      return toIsoDate(`${compact[1]}-${compact[2]}-${compact[3]}`);
    }
  } catch {
    // ignore
  }
  return null;
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
 * @dev True when every year embedded in the URL is before the watch's year.
 *      Catches historical climate PDFs / archive paths that Tavily still ranks high
 *      and that can confuse the detector into inventing a post-watch event date.
 */
export function urlLooksHistorical(
  url: string,
  watchCreatedAt: string,
): boolean {
  const created = new Date(watchCreatedAt);
  if (Number.isNaN(created.getTime())) return false;
  const createdYear = created.getUTCFullYear();
  const years = [...url.matchAll(/20\d{2}/g)].map((m) => Number(m[0]));
  if (years.length === 0) return false;
  return years.every((y) => y < createdYear);
}

/** @dev Normalize authoritative domain list from the watch spec. */
function normalizeAuthDomains(spec: WatchSpec): string[] {
  return spec.authoritative_domains
    .map((d) =>
      d
        .toLowerCase()
        .replace(/^www\./, "")
        .trim(),
    )
    .filter(Boolean)
    .slice(0, 4);
}

function isAuthoritativeUrl(url: string, authDomains: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return authDomains.some((a) => host === a || host.endsWith(`.${a}`));
  } catch {
    return false;
  }
}

/**
 * @dev Build open-web search jobs for the mode (query × topic).
 * @notice Exported for unit tests that assert credit-saving job shape.
 */
export function buildOpenSearchJobs(
  queries: string[],
  mode: RetrievalMode,
): Array<{ query: string; topic: SearchTopic }> {
  const policy = MODE_POLICY[mode];
  const capped = queries.slice(0, policy.maxQueries);
  return capped.flatMap((query) =>
    policy.topics.map((topic) => ({ query, topic })),
  );
}

/**
 * @dev site: jobs for domains not already present in open results (unless always).
 * @notice Exported for unit tests.
 */
export function buildSiteSearchJobs(args: {
  mode: RetrievalMode;
  seed: string;
  authDomains: string[];
  openResults: Array<{ url: string }>;
}): Array<{ query: string; topic: SearchTopic }> {
  const policy = MODE_POLICY[args.mode];
  if (policy.maxSiteSearches <= 0 || args.authDomains.length === 0) return [];

  const hitAuth = args.openResults.some((r) =>
    isAuthoritativeUrl(r.url, args.authDomains),
  );
  if (!policy.alwaysSiteSearch && hitAuth) return [];

  return args.authDomains.slice(0, policy.maxSiteSearches).map((domain) => ({
    query: `site:${domain} ${args.seed}`,
    topic: "general" as const,
  }));
}

/**
 * @notice Retrieve web candidates for a watch using its compiled search_queries
 *         (or an explicit query list from the monitoring plan's current round).
 * @dev Merges searches per mode policy, enriches thin snippets via extract,
 *      returns RetrievalCandidate[]. Undated hits keep a retrievedAt fallback
 *      so official observation pages are not silently discarded.
 * @param spec WatchSpec with search_queries and created_at.
 * @param options.retrievedAt Used as published_at when Tavily omits a date.
 * @param options.queries Bounded query list for this round; defaults to spec.search_queries.
 * @param options.mode "baseline" (cheap quiet check) or "deep" (dig-deeper / follow-up).
 * @return Deduplicated candidates ready for applyRetrievalFilters.
 */
export async function retrieveCandidates(
  spec: WatchSpec,
  options: {
    retrievedAt?: string;
    queries?: string[];
    mode?: RetrievalMode;
  } = {},
): Promise<RetrievalCandidate[]> {
  const retrievedAt = options.retrievedAt ?? new Date().toISOString();
  const mode = options.mode ?? "baseline";
  const policy = MODE_POLICY[mode];
  const queries =
    options.queries && options.queries.length > 0
      ? options.queries
      : spec.search_queries;

  // Do not pass Tavily start_date — it drops undated confirmation pages entirely.
  const openJobs = buildOpenSearchJobs(queries, mode);
  const authDomains = normalizeAuthDomains(spec);

  const openBatches = await mapPool(
    openJobs,
    SEARCH_CONCURRENCY,
    async ({ query, topic }) => {
      const response = await tavilySearch(query, {
        maxResults: MAX_RESULTS_PER_QUERY,
        searchDepth: policy.searchDepth,
        topic,
        // Bias news searches toward the watch's preferred domains when set.
        includeDomains:
          topic === "news" && authDomains.length > 0 ? authDomains : undefined,
      });
      return response.results ?? [];
    },
  );

  const openResults = openBatches.flat();
  const seed = queries[0] ?? spec.clarified_statement;
  const siteJobs = buildSiteSearchJobs({
    mode,
    seed,
    authDomains,
    openResults,
  });

  const siteBatches =
    siteJobs.length > 0
      ? await mapPool(siteJobs, SEARCH_CONCURRENCY, async ({ query, topic }) => {
          const response = await tavilySearch(query, {
            maxResults: MAX_RESULTS_PER_QUERY,
            searchDepth: policy.searchDepth,
            topic,
          });
          return response.results ?? [];
        })
      : [];

  const byUrl = new Map<string, TavilySearchResult>();
  for (const batch of [...openBatches, ...siteBatches]) {
    for (const result of batch) {
      if (!result?.url) continue;
      const key = normalizeUrl(result.url);
      const existing = byUrl.get(key);
      // Prefer the hit that has a publish date; otherwise keep the higher score.
      const resultDated = Boolean(result.published_date);
      const existingDated = Boolean(existing?.published_date);
      if (!existing) {
        byUrl.set(key, result);
        continue;
      }
      if (resultDated && !existingDated) {
        byUrl.set(key, result);
        continue;
      }
      if (
        resultDated === existingDated &&
        (result.score ?? 0) > (existing.score ?? 0)
      ) {
        byUrl.set(key, result);
      }
    }
  }

  // Prefer authoritative domains, then dated hits, then Tavily score. Demote
  // live dashboards so extract + judge see confirmation pages first.
  const rankedResults = [...byUrl.values()].sort((a, b) => {
    const dashA = looksLikeLiveDashboard(a.title || "", a.url) ? 1 : 0;
    const dashB = looksLikeLiveDashboard(b.title || "", b.url) ? 1 : 0;
    if (dashA !== dashB) return dashA - dashB;
    const authA = isAuthoritativeUrl(a.url, authDomains) ? 0 : 1;
    const authB = isAuthoritativeUrl(b.url, authDomains) ? 0 : 1;
    if (authA !== authB) return authA - authB;
    const datedA = a.published_date ? 0 : 1;
    const datedB = b.published_date ? 0 : 1;
    if (datedA !== datedB) return datedA - datedB;
    return (b.score ?? 0) - (a.score ?? 0);
  });
  const uniqueResults = diversifyResultsByDomain(rankedResults);

  const extractCandidates = uniqueResults.slice(0, MAX_EXTRACT_URLS);
  const extractUrls = policy.skipExtractWhenRich
    ? extractCandidates
        .filter(
          (r) =>
            !(r.content && r.content.trim().length >= MIN_SNIPPET_SKIP_EXTRACT),
        )
        .map((r) => r.url)
    : extractCandidates.map((r) => r.url);

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
    if (urlLooksHistorical(result.url, spec.created_at)) continue;

    const publishedAt =
      toIsoDate(result.published_date) ||
      publishedDateFromUrl(result.url) ||
      toIsoDate(null, retrievedAt);
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

/**
 * @notice Re-fetch specific previously seen pages so their CURRENT content can be judged again.
 * @dev Used for plan-approved re-checks of pages that update in place (official data
 *      pages, results pages). published_at is set to fetch time: the page's original
 *      date is unknown after an in-place update, and the notify decision still
 *      requires a post-watch event date from the judged content itself.
 * @param spec WatchSpec (clarified_statement focuses the extract chunks).
 * @param urls Budget-validated URLs from the monitoring plan.
 * @return One candidate per URL that returned content; failures are skipped.
 */
export async function retrieveByUrls(
  spec: WatchSpec,
  urls: string[],
): Promise<RetrievalCandidate[]> {
  if (urls.length === 0) return [];

  try {
    const extracted = await tavilyExtract(urls, {
      query: spec.clarified_statement,
      chunksPerSource: 3,
      extractDepth: "basic",
    });

    const fetchedAt = new Date().toISOString();
    const candidates: RetrievalCandidate[] = [];
    for (const item of extracted.results ?? []) {
      if (!item.url || !item.raw_content) continue;
      candidates.push({
        url: item.url,
        domain: domainFromUrl(item.url),
        title: item.url,
        snippet: truncateSnippet(item.raw_content),
        published_at: fetchedAt,
        retrieval_source: "tavily" as const,
      });
    }
    return candidates;
  } catch {
    // A failed re-fetch should not fail the whole check.
    return [];
  }
}
