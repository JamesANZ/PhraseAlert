import { describe, expect, it } from "vitest";
import type { DetectionResult, RetrievalCandidate, WatchSpec } from "@/types";
import {
  decideFromEvidence,
  isPostWatchConfirmedTrigger,
  parseEventDateClaimed,
  type EvidenceRecord,
} from "./decide";

function spec(overrides: Partial<WatchSpec> = {}): WatchSpec {
  return {
    id: "w_test",
    raw_input: "Notify me when Trump wins the 2024 election",
    clarified_statement: "Donald Trump wins the 2024 US presidential election",
    trigger_conditions: ["Trump declared winner"],
    non_triggers: ["Polls or speculation"],
    entities: ["Donald Trump"],
    search_queries: ["Trump wins 2024 election"],
    authoritative_domains: ["apnews.com", "reuters.com"],
    created_at: "2023-01-01T00:00:00-05:00",
    check_frequency: "daily",
    status: "watching",
    ...overrides,
  };
}

function candidate(
  overrides: Partial<RetrievalCandidate> &
    Pick<RetrievalCandidate, "url" | "domain">,
): RetrievalCandidate {
  return {
    title: "Headline",
    snippet: "Snippet",
    published_at: "2024-11-06T08:00:00-05:00",
    retrieval_source: "fixture",
    ...overrides,
  };
}

function detection(
  overrides: Partial<DetectionResult> & Pick<DetectionResult, "verdict">,
): DetectionResult {
  return {
    confidence: 0.9,
    reasoning: "test",
    event_date_claimed: "2024-11-06",
    ...overrides,
  };
}

function evidence(
  domain: string,
  verdict: DetectionResult["verdict"],
  confidence: number,
): EvidenceRecord {
  return {
    candidate: candidate({
      url: `https://${domain}/article`,
      domain,
    }),
    detection: detection({ verdict, confidence }),
  };
}

describe("parseEventDateClaimed", () => {
  it("parses YYYY-MM-DD as UTC midnight", () => {
    expect(parseEventDateClaimed("2024-11-06")?.toISOString()).toBe(
      "2024-11-06T00:00:00.000Z",
    );
  });

  it("returns null for missing or invalid values", () => {
    expect(parseEventDateClaimed(null)).toBeNull();
    expect(parseEventDateClaimed(undefined)).toBeNull();
    expect(parseEventDateClaimed("not-a-date")).toBeNull();
  });
});

describe("isPostWatchConfirmedTrigger", () => {
  const createdAt = "2023-01-01T00:00:00-05:00";

  it("requires TRIGGERED with post-watch event date", () => {
    expect(
      isPostWatchConfirmedTrigger(
        detection({
          verdict: "TRIGGERED",
          event_date_claimed: "2024-11-06",
        }),
        createdAt,
      ),
    ).toBe(true);

    expect(
      isPostWatchConfirmedTrigger(
        detection({
          verdict: "TRIGGERED",
          event_date_claimed: "2022-01-01",
        }),
        createdAt,
      ),
    ).toBe(false);

    expect(
      isPostWatchConfirmedTrigger(
        detection({
          verdict: "TRIGGERED",
          event_date_claimed: null,
        }),
        createdAt,
      ),
    ).toBe(false);
  });
});

describe("decideFromEvidence", () => {
  it("does not notify on empty evidence", () => {
    const result = decideFromEvidence(spec(), []);
    expect(result.should_notify).toBe(false);
    expect(result.top_verdict).toBe("NOT_TRIGGERED");
    expect(result.needs_corroboration).toBe(false);
    expect(result.reasoning).toMatch(/No candidates/i);
  });

  it("notifies on authoritative high-confidence solo trigger", () => {
    const result = decideFromEvidence(spec(), [
      evidence("apnews.com", "TRIGGERED", 0.9),
    ]);
    expect(result.should_notify).toBe(true);
    expect(result.top_verdict).toBe("TRIGGERED");
    expect(result.needs_corroboration).toBe(false);
  });

  it("does not notify on authoritative trigger below confidence threshold", () => {
    const result = decideFromEvidence(spec(), [
      evidence("apnews.com", "TRIGGERED", 0.5),
    ]);
    expect(result.should_notify).toBe(false);
    expect(result.needs_corroboration).toBe(true);
  });

  it("notifies when two independent domains corroborate", () => {
    const result = decideFromEvidence(spec(), [
      evidence("cnn.com", "TRIGGERED", 0.8),
      evidence("bbc.com", "TRIGGERED", 0.7),
    ]);
    expect(result.should_notify).toBe(true);
    expect(result.top_verdict).toBe("TRIGGERED");
    expect(result.needs_corroboration).toBe(false);
  });

  it("requires corroboration for a single non-authoritative trigger", () => {
    const result = decideFromEvidence(spec(), [
      evidence("blog.example.com", "TRIGGERED", 0.95),
    ]);
    expect(result.should_notify).toBe(false);
    expect(result.top_verdict).toBe("TRIGGERED");
    expect(result.needs_corroboration).toBe(true);
  });

  it("does not notify when nothing is triggered", () => {
    const result = decideFromEvidence(spec(), [
      evidence("nytimes.com", "NOT_TRIGGERED", 0.9),
      evidence("bbc.com", "AMBIGUOUS", 0.4),
    ]);
    expect(result.should_notify).toBe(false);
    expect(result.needs_corroboration).toBe(false);
  });

  it("does not notify when event_date_claimed is before watch creation", () => {
    const result = decideFromEvidence(spec(), [
      {
        candidate: candidate({
          url: "https://apnews.com/recap",
          domain: "apnews.com",
          published_at: "2024-11-06T08:00:00-05:00",
        }),
        detection: detection({
          verdict: "TRIGGERED",
          confidence: 0.95,
          event_date_claimed: "2022-06-01",
        }),
      },
    ]);
    expect(result.should_notify).toBe(false);
    expect(result.top_verdict).toBe("NOT_TRIGGERED");
    expect(result.needs_corroboration).toBe(false);
    expect(result.reasoning).toMatch(/on or after watch creation/i);
  });

  it("does not notify when event_date_claimed is missing", () => {
    const result = decideFromEvidence(spec(), [
      {
        candidate: candidate({
          url: "https://apnews.com/undated-event",
          domain: "apnews.com",
        }),
        detection: detection({
          verdict: "TRIGGERED",
          confidence: 0.95,
          event_date_claimed: null,
        }),
      },
    ]);
    expect(result.should_notify).toBe(false);
    expect(result.top_verdict).toBe("NOT_TRIGGERED");
    expect(result.needs_corroboration).toBe(false);
  });

  it("still notifies when event_date_claimed is on or after watch creation", () => {
    const result = decideFromEvidence(spec(), [
      {
        candidate: candidate({
          url: "https://apnews.com/post-watch",
          domain: "apnews.com",
        }),
        detection: detection({
          verdict: "TRIGGERED",
          confidence: 0.9,
          event_date_claimed: "2024-11-06",
        }),
      },
    ]);
    expect(result.should_notify).toBe(true);
    expect(result.top_verdict).toBe("TRIGGERED");
  });
});
