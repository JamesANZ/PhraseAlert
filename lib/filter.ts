import type { RetrievalCandidate } from "../types/index.js";

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

export function isPublishedAfterWatch(
  candidate: RetrievalCandidate,
  watchCreatedAt: string,
): boolean {
  return new Date(candidate.published_at) >= new Date(watchCreatedAt);
}

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
