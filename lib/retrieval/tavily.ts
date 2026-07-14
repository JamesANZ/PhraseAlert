/**
 * @title Tavily API client
 * @notice Thin fetch wrapper for Tavily /search and /extract endpoints.
 * @dev Used by lib/retrieval/index.ts. Requires TAVILY_API_KEY in environment.
 * @custom:env TAVILY_API_KEY
 */
const TAVILY_BASE = "https://api.tavily.com";

/** @dev Single result from Tavily search API. */
export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  published_date?: string | null;
  raw_content?: string | null;
}

/** @dev Response envelope from POST /search. */
export interface TavilySearchResponse {
  results: TavilySearchResult[];
  response_time?: number;
}

/** @dev Extracted page content for one URL. */
export interface TavilyExtractResult {
  url: string;
  raw_content: string;
}

/** @dev Response envelope from POST /extract. */
export interface TavilyExtractResponse {
  results: TavilyExtractResult[];
  failed_results?: Array<{ url: string; error: string }>;
}

/** @dev Options for tavilySearch. startDate limits to content after watch creation. */
export interface TavilySearchOptions {
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
  startDate?: string;
  topic?: "general" | "news" | "finance";
}

/** @dev Options for tavilyExtract. query enables chunked relevance extraction. */
export interface TavilyExtractOptions {
  query?: string;
  chunksPerSource?: number;
  extractDepth?: "basic" | "advanced";
}

/** @dev Reads TAVILY_API_KEY; throws if missing. */
function getApiKey(): string {
  const key = process.env.TAVILY_API_KEY;
  if (!key) {
    throw new Error("TAVILY_API_KEY is not configured");
  }
  return key;
}

/** @dev Shared POST helper with Bearer auth and error surfacing. */
async function tavilyFetch<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${TAVILY_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Tavily ${path} failed (${response.status}): ${text.slice(0, 300) || response.statusText}`,
    );
  }

  return (await response.json()) as T;
}

/**
 * @notice Run a Tavily web search for one query string.
 * @param query Search phrase from WatchSpec.search_queries.
 * @param opts maxResults, searchDepth, startDate (YYYY-MM-DD), topic.
 */
export async function tavilySearch(
  query: string,
  opts: TavilySearchOptions = {},
): Promise<TavilySearchResponse> {
  const body: Record<string, unknown> = {
    query,
    search_depth: opts.searchDepth ?? "basic",
    max_results: opts.maxResults ?? 5,
    include_answer: false,
    topic: opts.topic ?? "general",
  };

  if (opts.startDate) {
    body.start_date = opts.startDate;
  }

  return tavilyFetch<TavilySearchResponse>("/search", body);
}

/**
 * @notice Fetch full or chunked page content for a list of URLs.
 * @param urls Up to MAX_EXTRACT_URLS in practice from retrieval layer.
 * @param opts query + chunksPerSource for relevance-focused excerpts.
 */
export async function tavilyExtract(
  urls: string[],
  opts: TavilyExtractOptions = {},
): Promise<TavilyExtractResponse> {
  if (urls.length === 0) {
    return { results: [] };
  }

  const body: Record<string, unknown> = {
    urls,
    extract_depth: opts.extractDepth ?? "basic",
  };

  if (opts.query) {
    body.query = opts.query;
    body.chunks_per_source = opts.chunksPerSource ?? 3;
  }

  return tavilyFetch<TavilyExtractResponse>("/extract", body);
}
