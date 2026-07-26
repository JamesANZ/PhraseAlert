import { describe, expect, it } from "vitest";
import type { MonitoringPlan, PlanRuntimeState, WatchSpec } from "@/types";
import { PlanRuntimeStateSchema } from "@/types";
import {
  filterRevisitUrls,
  isWatchDue,
  planForSpec,
  planStateForSpec,
  recordRevisits,
  sanitizeMonitoringPlan,
} from "./monitoring-plan";

function spec(overrides: Partial<WatchSpec> = {}): WatchSpec {
  return {
    id: "w_test",
    raw_input: "Notify me if Auckland records rain on Saturday, 25 July 2026",
    clarified_statement:
      "Auckland records measurable rainfall on Saturday 25 July 2026",
    trigger_conditions: ["Official rainfall recorded in Auckland on 25 July"],
    non_triggers: ["Forecasts", "Rain in other cities"],
    entities: ["Auckland"],
    search_queries: ["Auckland rainfall recorded 25 July 2026"],
    authoritative_domains: ["metservice.com"],
    created_at: "2026-07-24T20:00:00+12:00",
    check_frequency: "daily",
    status: "watching",
    ...overrides,
  };
}

function plan(overrides: Partial<MonitoringPlan> = {}): MonitoringPlan {
  return {
    plan_version: 1,
    baseline_queries: ["Auckland rainfall recorded 25 July 2026"],
    follow_up_queries: ["MetService Auckland daily rainfall summary July 2026"],
    revisit: {
      allowed: true,
      domains: ["metservice.com"],
      max_revisits_per_url: 2,
    },
    ...overrides,
  };
}

function state(overrides: Partial<PlanRuntimeState> = {}): PlanRuntimeState {
  return PlanRuntimeStateSchema.parse(overrides);
}

describe("sanitizeMonitoringPlan", () => {
  it("accepts valid model output", () => {
    const result = sanitizeMonitoringPlan({
      baseline_queries: ["Auckland rain recorded 25 July"],
      follow_up_queries: ["MetService rainfall summary"],
      revisit: { allowed: true, domains: ["metservice.com"] },
    });
    expect(result).not.toBeNull();
    expect(result?.revisit.allowed).toBe(true);
    expect(result?.revisit.max_revisits_per_url).toBe(2);
  });

  it("trims over-budget queries instead of rejecting", () => {
    const result = sanitizeMonitoringPlan({
      baseline_queries: ["a query", "b query", "c query", "d query", "e query"],
      follow_up_queries: [`${"x".repeat(500)} long`],
    });
    expect(result?.baseline_queries).toHaveLength(4);
    expect(result?.follow_up_queries[0]!.length).toBeLessThanOrEqual(200);
  });

  it("clamps the per-URL re-check budget", () => {
    const result = sanitizeMonitoringPlan({
      baseline_queries: ["a query"],
      revisit: { allowed: true, domains: ["x.com"], max_revisits_per_url: 99 },
    });
    expect(result?.revisit.max_revisits_per_url).toBe(3);
  });

  it("drops non-string junk and returns null for unusable output", () => {
    expect(sanitizeMonitoringPlan(null)).toBeNull();
    expect(sanitizeMonitoringPlan("not an object")).toBeNull();
    expect(sanitizeMonitoringPlan({ baseline_queries: [42, {}] })).toBeNull();
  });
});

describe("planForSpec", () => {
  it("returns the AI-written plan when present", () => {
    const s = spec({ monitoring_plan: plan() });
    expect(planForSpec(s)).toEqual(plan());
  });

  it("gives legacy watches a confirmation query and bounded revisits", () => {
    const legacy = planForSpec(spec());
    expect(legacy.baseline_queries).toEqual(spec().search_queries);
    expect(legacy.follow_up_queries).toEqual([
      `${spec().clarified_statement} confirmed result`,
    ]);
    expect(legacy.revisit).toEqual({
      allowed: true,
      domains: ["metservice.com"],
      max_revisits_per_url: 2,
    });
  });
});

describe("planStateForSpec", () => {
  it("returns defaults for missing or malformed state", () => {
    expect(planStateForSpec(spec()).pending_follow_up).toBe(false);
    const malformed = spec({
      plan_state: { url_revisits: "junk" } as unknown as PlanRuntimeState,
    });
    expect(planStateForSpec(malformed).url_revisits).toEqual({});
  });
});

describe("filterRevisitUrls", () => {
  const url = "https://www.metservice.com/locations/auckland";
  const seen = new Set([url]);

  it("allows a seen URL on an allowed domain within budget", () => {
    expect(filterRevisitUrls(plan(), state(), [url], seen)).toEqual([url]);
  });

  it("returns nothing when the policy disallows re-checks", () => {
    const p = plan({
      revisit: { allowed: false, domains: [], max_revisits_per_url: 2 },
    });
    expect(filterRevisitUrls(p, state(), [url], seen)).toEqual([]);
  });

  it("rejects URLs never seen before or on unlisted domains", () => {
    expect(
      filterRevisitUrls(plan(), state(), ["https://metservice.com/new"], seen),
    ).toEqual([]);
    expect(
      filterRevisitUrls(
        plan(),
        state(),
        ["https://weather.example.com/auckland"],
        new Set(["https://weather.example.com/auckland"]),
      ),
    ).toEqual([]);
  });

  it("enforces the per-URL budget", () => {
    const used = state({
      url_revisits: { [url]: { count: 2, last_at: "2026-07-25T10:00:00Z" } },
    });
    expect(filterRevisitUrls(plan(), used, [url], seen)).toEqual([]);
  });

  it("caps the number of URLs per round and dedupes", () => {
    const urls = [1, 2, 3, 4, 5].map((i) => `https://metservice.com/page-${i}`);
    const allSeen = new Set(urls);
    const result = filterRevisitUrls(
      plan(),
      state(),
      [...urls, urls[0]!],
      allSeen,
    );
    expect(result).toHaveLength(3);
  });
});

describe("recordRevisits", () => {
  it("bumps per-URL counts", () => {
    const url = "https://metservice.com/auckland";
    const once = recordRevisits(state(), [url], "2026-07-25T10:00:00Z");
    const twice = recordRevisits(once, [url], "2026-07-25T14:00:00Z");
    expect(twice.url_revisits[url]?.count).toBe(2);
    expect(twice.url_revisits[url]?.last_at).toBe("2026-07-25T14:00:00Z");
  });
});

describe("isWatchDue (hourly cron cost guard)", () => {
  const now = new Date("2026-07-25T12:00:00Z");

  function watchWith(planState?: Partial<PlanRuntimeState>) {
    return {
      spec: spec(planState ? { plan_state: state(planState) } : {}),
    };
  }

  it("is due when it has never run", () => {
    expect(isWatchDue(watchWith(), now)).toBe(true);
  });

  it("is skipped after a recent run with nothing pending", () => {
    expect(
      isWatchDue(watchWith({ last_check_at: "2026-07-25T10:00:00Z" }), now),
    ).toBe(false);
  });

  it("is due again once the daily cadence elapses", () => {
    expect(
      isWatchDue(watchWith({ last_check_at: "2026-07-24T11:00:00Z" }), now),
    ).toBe(true);
  });

  it("is due early when a pending follow-up's time has arrived", () => {
    expect(
      isWatchDue(
        watchWith({
          last_check_at: "2026-07-25T08:00:00Z",
          pending_follow_up: true,
          next_eligible_at: "2026-07-25T11:00:00Z",
        }),
        now,
      ),
    ).toBe(true);
  });

  it("is skipped while a pending follow-up is not yet eligible", () => {
    expect(
      isWatchDue(
        watchWith({
          last_check_at: "2026-07-25T08:00:00Z",
          pending_follow_up: true,
          next_eligible_at: "2026-07-25T20:00:00Z",
        }),
        now,
      ),
    ).toBe(false);
  });
});
