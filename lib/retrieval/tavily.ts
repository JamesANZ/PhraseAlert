const TAVILY_BASE = "https://api.tavily.com";

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  published_date?: string | null;
  raw_content?: string | null;
}

export interface TavilySearchResponse {
  results: TavilySearchResult[];
  response_time?: number;
}

export interface TavilyExtractResult {
  url: string;
  raw_content: string;
}

export interface TavilyExtractResponse {
  results: TavilyExtractResult[];
  failed_results?: Array<{ url: string; error: string }>;
}

export interface TavilySearchOptions {
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
  startDate?: string;
  topic?: "general" | "news" | "finance";
}

export interface TavilyExtractOptions {
  query?: string;
  chunksPerSource?: number;
  extractDepth?: "basic" | "advanced";
}

function getApiKey(): string {
  const key = process.env.TAVILY_API_KEY;
  if (!key) {
    throw new Error("TAVILY_API_KEY is not configured");
  }
  return key;
}

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
