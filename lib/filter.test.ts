import { describe, expect, it } from "vitest";
import type { RetrievalCandidate } from "@/types";
import {
  applyRetrievalFilters,
  isPublishedAfterWatch,
  normalizeUrl,
} from "./filter";

const WATCH_CREATED_AT = "2023-01-01T00:00:00-05:00";

function candidate(
  overrides: Partial<RetrievalCandidate> &
    Pick<RetrievalCandidate, "url" | "published_at">,
): RetrievalCandidate {
  return {
    domain: "example.com",
    title: "Example",
    snippet: "Snippet",
    retrieval_source: "fixture",
    ...overrides,
  };
}

describe("normalizeUrl", () => {
  it("strips hash fragments and trailing slashes", () => {
    expect(normalizeUrl("https://example.com/path/#section")).toBe(
      "https://example.com/path",
    );
  });

  it("passes through invalid URLs unchanged", () => {
    expect(normalizeUrl("not a url")).toBe("not a url");
  });
});

describe("isPublishedAfterWatch", () => {
  it("keeps candidates published on or after watch creation", () => {
    expect(
      isPublishedAfterWatch(
        candidate({
          url: "https://example.com/a",
          published_at: "2023-01-01T00:00:00-05:00",
        }),
        WATCH_CREATED_AT,
      ),
    ).toBe(true);

    expect(
      isPublishedAfterWatch(
        candidate({
          url: "https://example.com/b",
          published_at: "2024-11-06T08:00:00-05:00",
        }),
        WATCH_CREATED_AT,
      ),
    ).toBe(true);
  });

  it("drops pre-watch distractors", () => {
    expect(
      isPublishedAfterWatch(
        candidate({
          url: "https://nytimes.com/2020/biden",
          published_at: "2020-11-07T12:00:00-05:00",
        }),
        WATCH_CREATED_AT,
      ),
    ).toBe(false);
  });

  it("drops invalid or empty published_at", () => {
    expect(
      isPublishedAfterWatch(
        candidate({
          url: "https://example.com/undated",
          published_at: "not-a-date",
        }),
        WATCH_CREATED_AT,
      ),
    ).toBe(false);

    expect(
      isPublishedAfterWatch(
        candidate({
          url: "https://example.com/empty",
          published_at: "",
        }),
        WATCH_CREATED_AT,
      ),
    ).toBe(false);
  });
});

describe("applyRetrievalFilters", () => {
  const preWatch = candidate({
    url: "https://nytimes.com/2020/biden-wins",
    domain: "nytimes.com",
    published_at: "2020-11-07T12:00:00-05:00",
  });
  const postWatch = candidate({
    url: "https://apnews.com/trump-wins-2024",
    domain: "apnews.com",
    published_at: "2024-11-06T08:14:00-05:00",
  });
  const later = candidate({
    url: "https://reuters.com/trump-wins/",
    domain: "reuters.com",
    published_at: "2024-11-06T09:30:00-05:00",
  });

  it("drops pre-watch candidates and keeps post-watch ones", () => {
    const filtered = applyRetrievalFilters(
      [preWatch, postWatch, later],
      WATCH_CREATED_AT,
    );
    expect(filtered).toHaveLength(2);
    expect(filtered.map((c) => c.domain)).toEqual([
      "apnews.com",
      "reuters.com",
    ]);
  });

  it("dedupes seen URLs after normalization", () => {
    const seen = new Set([normalizeUrl("https://apnews.com/trump-wins-2024/")]);
    const filtered = applyRetrievalFilters(
      [postWatch, later],
      WATCH_CREATED_AT,
      seen,
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].domain).toBe("reuters.com");
  });

  it("excludes denylisted domains", () => {
    const filtered = applyRetrievalFilters(
      [postWatch, later],
      WATCH_CREATED_AT,
      new Set(),
      ["apnews.com"],
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].domain).toBe("reuters.com");
  });

  it("drops undated candidates alongside pre-watch ones", () => {
    const undated = candidate({
      url: "https://example.com/no-date",
      domain: "example.com",
      published_at: "invalid",
    });
    const filtered = applyRetrievalFilters(
      [preWatch, undated, postWatch],
      WATCH_CREATED_AT,
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].domain).toBe("apnews.com");
  });
});
