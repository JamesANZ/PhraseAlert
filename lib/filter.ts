/**
 * @title Retrieval filters
 * @notice Drops candidates that are too old, already evaluated, or on a denylist before detection.
 * @dev Phase 1 judgment layer. Enforces the post-watch-only rule central to PhraseAlert's value prop.
 * @custom:pipeline step 2 — filter
 */
import type { RetrievalCandidate } from "@/types";

/**
 * @notice Canonicalize a URL for deduplication across check runs.
 * @dev Strips hash fragments and trailing slashes. Invalid URLs pass through unchanged.
 * @param url Raw candidate URL.
 * @return Normalized URL string.
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * @notice True when the source was published on or after the watch was created.
 * @dev Pre-watch articles (guides, old news) must not trigger alerts.
 * @param candidate Retrieval candidate with published_at.
 * @param watchCreatedAt ISO datetime from watch creation.
 */
export function isPublishedAfterWatch(
  candidate: RetrievalCandidate,
  watchCreatedAt: string,
): boolean {
  return new Date(candidate.published_at) >= new Date(watchCreatedAt);
}

/**
 * @notice Apply post-watch, dedup, and domain deny filters to a candidate list.
 * @dev Called after Tavily retrieval and before detection. Order preserved from input.
 * @param candidates Raw retrieval results.
 * @param watchCreatedAt Watch creation timestamp for temporal filter.
 * @param seenUrls Normalized URLs from prior checks on this watch (default empty).
 * @param denylistDomains Hostnames to exclude (default empty).
 * @return Filtered candidates eligible for detection.
 */
export function applyRetrievalFilters(
  candidates: RetrievalCandidate[],
  watchCreatedAt: string,
  seenUrls: Set<string> = new Set(),
  denylistDomains: string[] = [],
): RetrievalCandidate[] {
  const deny = new Set(denylistDomains.map((d) => d.toLowerCase()));

  return candidates.filter((candidate) => {
    if (!isPublishedAfterWatch(candidate, watchCreatedAt)) return false;

    const normalized = normalizeUrl(candidate.url);
    if (seenUrls.has(normalized)) return false;

    if (deny.has(candidate.domain.toLowerCase())) return false;

    return true;
  });
}
