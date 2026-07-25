import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MonitoringPlan,
  NextAction,
  RetrievalCandidate,
  WatchSpec,
} from "@/types";

vi.mock("@/lib/billing/entitlements", () => ({
  getUser: vi.fn(async () => ({ email: "user@example.com" })),
}));
vi.mock("@/lib/checks", () => ({
  createCheck: vi.fn(async () => "chk_test"),
  createEvidence: vi.fn(async () => undefined),
  listEvidenceUrlsForWatch: vi.fn(async () => new Set<string>()),
  updateCheckFindingsSummary: vi.fn(async () => undefined),
}));
vi.mock("@/lib/detector", () => ({
  detectEvent: vi.fn(),
}));
vi.mock("@/lib/findings", () => ({
  buildFindingsForNotify: vi.fn(async () => ({ summary: "summary" })),
}));
vi.mock("@/lib/notifications/email", () => ({
  sendWatchTriggeredEmail: vi.fn(async () => undefined),
}));
vi.mock("@/lib/retrieval", () => ({
  retrieveCandidates: vi.fn(async () => []),
  retrieveByUrls: vi.fn(async () => []),
}));
vi.mock("@/lib/watches", () => ({
  updateWatchStatus: vi.fn(async () => null),
  updateWatchPlanState: vi.fn(async () => null),
}));
vi.mock("@/lib/monitoring-plan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/monitoring-plan")>();
  return { ...actual, decideNextAction: vi.fn() };
});

import { getUser } from "@/lib/billing/entitlements";
import { runCheckForWatch } from "@/lib/check";
import { listEvidenceUrlsForWatch } from "@/lib/checks";
import { detectEvent } from "@/lib/detector";
import { decideNextAction } from "@/lib/monitoring-plan";
import { retrieveByUrls, retrieveCandidates } from "@/lib/retrieval";
import { updateWatchPlanState, updateWatchStatus } from "@/lib/watches";

const CREATED_AT = "2026-07-24T20:00:00+12:00";
const REVISIT_URL = "https://metservice.com/auckland-daily";

function plan(overrides: Partial<MonitoringPlan> = {}): MonitoringPlan {
  return {
    plan_version: 1,
    baseline_queries: ["Auckland rainfall recorded 25 July 2026"],
    follow_up_queries: ["MetService Auckland rainfall daily summary"],
    revisit: {
      allowed: true,
      domains: ["metservice.com"],
      max_revisits_per_url: 2,
    },
    ...overrides,
  };
}

function spec(overrides: Partial<WatchSpec> = {}): WatchSpec {
  return {
    id: "w_test",
    user_id: "u_test",
    raw_input: "Notify me if Auckland records rain on Saturday, 25 July 2026",
    clarified_statement:
      "Auckland records measurable rainfall on Saturday 25 July 2026",
    trigger_conditions: ["Official rainfall recorded in Auckland on 25 July"],
    non_triggers: ["Forecasts"],
    entities: ["Auckland"],
    search_queries: ["Auckland rainfall recorded 25 July 2026"],
    authoritative_domains: ["metservice.com"],
    monitoring_plan: plan(),
    created_at: CREATED_AT,
    check_frequency: "daily",
    status: "watching",
    ...overrides,
  };
}

function watchRow(specOverrides: Partial<WatchSpec> = {}) {
  return {
    id: "w_test",
    userId: "u_test",
    rawInput: "Notify me if Auckland records rain on Saturday, 25 July 2026",
    spec: spec(specOverrides),
    status: "watching" as const,
    createdAt: CREATED_AT,
    triggeredAt: null,
  };
}

function candidate(
  url: string,
  overrides: Partial<RetrievalCandidate> = {},
): RetrievalCandidate {
  return {
    url,
    domain: new URL(url).hostname.replace(/^www\./, ""),
    title: url,
    snippet: "snippet",
    published_at: "2026-07-25T10:00:00+12:00",
    retrieval_source: "tavily",
    ...overrides,
  };
}

function nextAction(overrides: Partial<NextAction> = {}): NextAction {
  return {
    action: "done",
    use_follow_up_queries: false,
    revisit_urls: [],
    recheck_after_hours: null,
    reasoning: "test",
    ...overrides,
  };
}

function mockDetect(
  fn: (candidate: RetrievalCandidate) => {
    verdict: "TRIGGERED" | "NOT_TRIGGERED" | "AMBIGUOUS";
    confidence: number;
    event_date_claimed?: string | null;
  },
) {
  vi.mocked(detectEvent).mockImplementation(async (_spec, c) => {
    const r = fn(c);
    return {
      verdict: r.verdict,
      confidence: r.confidence,
      reasoning: "mock",
      event_date_claimed: r.event_date_claimed ?? null,
      model: "mock-model",
    };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listEvidenceUrlsForWatch).mockResolvedValue(new Set());
  vi.mocked(retrieveCandidates).mockResolvedValue([]);
  vi.mocked(retrieveByUrls).mockResolvedValue([]);
  vi.mocked(getUser).mockResolvedValue({
    email: "user@example.com",
  } as Awaited<ReturnType<typeof getUser>>);
  vi.mocked(decideNextAction).mockResolvedValue(nextAction());
});

describe("runCheckForWatch", () => {
  it("runs exactly one extra round when the AI says dig deeper", async () => {
    vi.mocked(retrieveCandidates)
      .mockResolvedValueOnce([candidate("https://news.example.com/a")])
      .mockResolvedValueOnce([candidate("https://other.example.com/b")]);
    mockDetect(() => ({ verdict: "AMBIGUOUS", confidence: 0.4 }));
    vi.mocked(decideNextAction).mockResolvedValue(
      nextAction({ action: "dig_deeper", use_follow_up_queries: true }),
    );

    const result = await runCheckForWatch(watchRow());

    expect(result.followUpRan).toBe(true);
    expect(vi.mocked(retrieveCandidates)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(retrieveCandidates).mock.calls[0]![1]).toMatchObject({
      queries: plan().baseline_queries,
    });
    expect(vi.mocked(retrieveCandidates).mock.calls[1]![1]).toMatchObject({
      queries: plan().follow_up_queries,
    });
    // One planner consultation, no third retrieval round.
    expect(vi.mocked(decideNextAction)).toHaveBeenCalledTimes(1);
    expect(result.triggered).toBe(false);
  });

  it("does not consult the planner or keep searching once it notifies", async () => {
    vi.mocked(retrieveCandidates).mockResolvedValueOnce([
      candidate("https://metservice.com/confirmed"),
    ]);
    mockDetect(() => ({
      verdict: "TRIGGERED",
      confidence: 0.9,
      event_date_claimed: "2026-07-25",
    }));

    const result = await runCheckForWatch(watchRow());

    expect(result.triggered).toBe(true);
    expect(result.followUpRan).toBe(false);
    expect(vi.mocked(decideNextAction)).not.toHaveBeenCalled();
    expect(vi.mocked(updateWatchStatus)).toHaveBeenCalledWith(
      "w_test",
      "u_test",
      "triggered",
    );
    expect(vi.mocked(retrieveCandidates)).toHaveBeenCalledTimes(1);
  });

  it("keeps already-seen URLs blocked by default", async () => {
    const seenUrl = "https://news.example.com/seen";
    vi.mocked(listEvidenceUrlsForWatch).mockResolvedValue(new Set([seenUrl]));
    vi.mocked(retrieveCandidates).mockResolvedValueOnce([
      candidate(seenUrl),
      candidate("https://news.example.com/new"),
    ]);
    mockDetect(() => ({ verdict: "NOT_TRIGGERED", confidence: 0.8 }));

    const result = await runCheckForWatch(watchRow());

    expect(result.sourcesEvaluated).toBe(1);
    expect(vi.mocked(detectEvent).mock.calls[0]![1].url).toBe(
      "https://news.example.com/new",
    );
  });

  it("re-checks an updated page the AI queued and can trigger from it (rain-alert shape)", async () => {
    // A previous run saw the page while it showed no rain; the AI queued a
    // re-check for after the day ends. This run re-fetches it, now updated.
    vi.mocked(listEvidenceUrlsForWatch).mockResolvedValue(
      new Set([REVISIT_URL]),
    );
    vi.mocked(retrieveByUrls).mockResolvedValue([
      candidate(REVISIT_URL, {
        snippet: "14.2 mm of rain recorded in Auckland on Saturday 25 July",
      }),
    ]);
    mockDetect((c) =>
      c.url === REVISIT_URL
        ? {
            verdict: "TRIGGERED",
            confidence: 0.9,
            event_date_claimed: "2026-07-25",
          }
        : { verdict: "NOT_TRIGGERED", confidence: 0.8 },
    );

    const result = await runCheckForWatch(
      watchRow({
        plan_state: {
          last_check_at: "2026-07-25T06:00:00Z",
          pending_follow_up: true,
          next_eligible_at: "2026-07-25T10:00:00Z",
          pending_actions: {
            use_follow_up_queries: false,
            revisit_urls: [REVISIT_URL],
          },
          planner_note: null,
          url_revisits: {},
        },
      }),
    );

    expect(vi.mocked(retrieveByUrls)).toHaveBeenCalledWith(expect.anything(), [
      REVISIT_URL,
    ]);
    expect(result.triggered).toBe(true);
    // The re-check consumed budget in the saved state.
    const savedState = vi.mocked(updateWatchPlanState).mock.calls[0]![2];
    expect(savedState.url_revisits[REVISIT_URL]?.count).toBe(1);
    expect(savedState.pending_follow_up).toBe(false);
  });

  it("refuses a queued re-check whose per-URL budget is exhausted", async () => {
    vi.mocked(listEvidenceUrlsForWatch).mockResolvedValue(
      new Set([REVISIT_URL]),
    );
    mockDetect(() => ({ verdict: "NOT_TRIGGERED", confidence: 0.8 }));

    await runCheckForWatch(
      watchRow({
        plan_state: {
          last_check_at: "2026-07-25T06:00:00Z",
          pending_follow_up: true,
          next_eligible_at: "2026-07-25T10:00:00Z",
          pending_actions: {
            use_follow_up_queries: false,
            revisit_urls: [REVISIT_URL],
          },
          planner_note: null,
          url_revisits: {
            [REVISIT_URL]: { count: 2, last_at: "2026-07-25T06:00:00Z" },
          },
        },
      }),
    );

    expect(vi.mocked(retrieveByUrls)).toHaveBeenCalledWith(
      expect.anything(),
      [],
    );
  });

  it("saves a pending follow-up when the AI schedules a recheck", async () => {
    vi.mocked(retrieveCandidates).mockResolvedValueOnce([
      candidate("https://news.example.com/early"),
    ]);
    mockDetect(() => ({ verdict: "NOT_TRIGGERED", confidence: 0.7 }));
    vi.mocked(decideNextAction).mockResolvedValue(
      nextAction({
        action: "done",
        recheck_after_hours: 6,
        reasoning: "Event window closes tonight; confirm after that.",
      }),
    );

    const result = await runCheckForWatch(watchRow());

    expect(result.triggered).toBe(false);
    const savedState = vi.mocked(updateWatchPlanState).mock.calls[0]![2];
    expect(savedState.pending_follow_up).toBe(true);
    expect(savedState.next_eligible_at).not.toBeNull();
    expect(savedState.planner_note).toContain("Event window closes");
  });

  it("legacy watches without a plan still run with today's behavior", async () => {
    vi.mocked(retrieveCandidates).mockResolvedValueOnce([
      candidate("https://news.example.com/x"),
    ]);
    mockDetect(() => ({ verdict: "NOT_TRIGGERED", confidence: 0.8 }));

    const result = await runCheckForWatch(
      watchRow({ monitoring_plan: undefined }),
    );

    expect(result.sourcesEvaluated).toBe(1);
    expect(vi.mocked(retrieveCandidates).mock.calls[0]![1]).toMatchObject({
      queries: spec().search_queries,
    });
  });
});
