/**
 * @title Monitoring plan
 * @notice The AI-directed side of checking: sanitizes the compile-time plan,
 *         decides after each round whether to dig deeper, and enforces the
 *         page re-check and scheduling budgets in code.
 * @dev The AI recommends; this module validates. Notification safety rules
 *      stay in lib/decide.ts and are never relaxed here.
 */
import type { DecideResult, EvidenceRecord } from "@/lib/decide";
import { normalizeUrl } from "@/lib/filter";
import { completeJson } from "@/lib/inference";
import { PLAN_BASELINE_MS, PLAN_CEILING_MS } from "@/lib/constants";
import type { Plan } from "@/lib/billing/entitlements";
import {
  CheckFrequencySchema,
  MonitoringPlanSchema,
  NextActionSchema,
  PLAN_MAX_QUERIES,
  PLAN_MAX_QUERY_LENGTH,
  PLAN_MAX_REVISIT_DOMAINS,
  PLAN_MAX_REVISIT_URLS_PER_ROUND,
  PlanRuntimeStateSchema,
  type MonitoringPlan,
  type NextAction,
  type PlanRuntimeState,
  type WatchSpec,
} from "@/types";
import type { z } from "zod";

/** @dev Legacy alias: free-tier baseline in hours. */
export const DAILY_CADENCE_HOURS = 23;

export type CheckFrequency = z.infer<typeof CheckFrequencySchema>;

/** @notice Map effective plan → compiled check_frequency stamp. */
export function checkFrequencyForPlan(plan: Plan): CheckFrequency {
  if (plan === "max") return "hourly";
  if (plan === "plus") return "every_6h";
  return "daily";
}

/** @notice Clamp AI recheck delay so it is never faster than the plan ceiling. */
export function clampRecheckHours(hours: number, plan: Plan): number {
  const ceilingHours = PLAN_CEILING_MS[plan] / 3600_000;
  return Math.max(hours, ceilingHours);
}

/** @dev Trim strings and slice arrays so slightly-over-budget model output is kept rather than rejected. */
function trimStrings(
  values: unknown,
  maxItems: number,
  maxLen: number,
): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

/**
 * @notice Validate AI-written plan output, trimming over-budget fields first.
 * @return A valid MonitoringPlan, or null when the output is unusable.
 */
export function sanitizeMonitoringPlan(input: unknown): MonitoringPlan | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const revisitRaw =
    raw.revisit && typeof raw.revisit === "object"
      ? (raw.revisit as Record<string, unknown>)
      : {};

  const candidate = {
    plan_version: 1,
    baseline_queries: trimStrings(
      raw.baseline_queries,
      PLAN_MAX_QUERIES,
      PLAN_MAX_QUERY_LENGTH,
    ),
    follow_up_queries: trimStrings(
      raw.follow_up_queries,
      PLAN_MAX_QUERIES,
      PLAN_MAX_QUERY_LENGTH,
    ),
    revisit: {
      allowed: revisitRaw.allowed === true,
      domains: trimStrings(revisitRaw.domains, PLAN_MAX_REVISIT_DOMAINS, 100),
      max_revisits_per_url:
        typeof revisitRaw.max_revisits_per_url === "number"
          ? Math.max(
              0,
              Math.min(3, Math.round(revisitRaw.max_revisits_per_url)),
            )
          : 2,
    },
  };

  const parsed = MonitoringPlanSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * @notice Plan for a spec: the AI-written one, or a safe fallback that gives
 *         legacy watches a confirmation query and bounded authoritative-page re-checks.
 */
export function planForSpec(spec: WatchSpec): MonitoringPlan {
  if (spec.monitoring_plan) return spec.monitoring_plan;
  const confirmationQuery =
    `${spec.clarified_statement} confirmed result`.slice(
      0,
      PLAN_MAX_QUERY_LENGTH,
    );
  return MonitoringPlanSchema.parse({
    baseline_queries: spec.search_queries.slice(0, PLAN_MAX_QUERIES),
    follow_up_queries: [confirmationQuery],
    revisit: {
      allowed: spec.authoritative_domains.length > 0,
      domains: spec.authoritative_domains.slice(0, PLAN_MAX_REVISIT_DOMAINS),
      max_revisits_per_url: 2,
    },
  });
}

/** @notice Runtime state for a spec, tolerating missing or malformed stored state. */
export function planStateForSpec(spec: WatchSpec): PlanRuntimeState {
  const parsed = PlanRuntimeStateSchema.safeParse(spec.plan_state ?? {});
  return parsed.success ? parsed.data : PlanRuntimeStateSchema.parse({});
}

/** @dev True when a URL's domain matches the revisit policy's domain list (supports subdomains). */
function domainAllowedForRevisit(url: string, plan: MonitoringPlan): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  return plan.revisit.domains.some((d) => {
    const allowed = d.toLowerCase().replace(/^www\./, "");
    return host === allowed || host.endsWith(`.${allowed}`);
  });
}

/**
 * @notice Filter AI-requested re-check URLs down to what the policy and budgets allow.
 * @dev A URL qualifies only when: policy allows re-checks, its domain is listed,
 *      it was actually seen before, and its per-URL budget is not exhausted.
 */
export function filterRevisitUrls(
  plan: MonitoringPlan,
  state: PlanRuntimeState,
  requested: string[],
  seenUrls: Set<string>,
): string[] {
  if (!plan.revisit.allowed || plan.revisit.max_revisits_per_url === 0) {
    return [];
  }

  const out: string[] = [];
  const picked = new Set<string>();
  for (const url of requested) {
    if (out.length >= PLAN_MAX_REVISIT_URLS_PER_ROUND) break;
    const normalized = normalizeUrl(url);
    if (picked.has(normalized)) continue;
    if (!seenUrls.has(normalized)) continue;
    if (!domainAllowedForRevisit(url, plan)) continue;
    const used = state.url_revisits[normalized]?.count ?? 0;
    if (used >= plan.revisit.max_revisits_per_url) continue;
    picked.add(normalized);
    out.push(url);
  }
  return out;
}

/** @notice Record that URLs were re-checked now, bumping their budgets. */
export function recordRevisits(
  state: PlanRuntimeState,
  urls: string[],
  now: string,
): PlanRuntimeState {
  if (urls.length === 0) return state;
  const url_revisits = { ...state.url_revisits };
  for (const url of urls) {
    const key = normalizeUrl(url);
    const prev = url_revisits[key];
    url_revisits[key] = { count: (prev?.count ?? 0) + 1, last_at: now };
  }
  return { ...state, url_revisits };
}

/**
 * @notice Cron guard: should this watch run on the current tick?
 * @dev Due when never run, baseline elapsed for the owner's plan, or an AI
 *      follow-up's next_eligible_at has arrived. Ceiling is enforced when the
 *      follow-up delay is written (see clampRecheckHours).
 */
export function isWatchDue(
  watch: { spec: WatchSpec },
  now: Date,
  plan: Plan = "free",
): boolean {
  const state = planStateForSpec(watch.spec);
  if (!state.last_check_at) return true;

  const last = Date.parse(state.last_check_at);
  if (Number.isNaN(last)) return true;

  const baselineMs = PLAN_BASELINE_MS[plan];
  if (now.getTime() - last >= baselineMs) return true;

  if (state.pending_follow_up && state.next_eligible_at) {
    const eligible = Date.parse(state.next_eligible_at);
    if (!Number.isNaN(eligible) && now.getTime() >= eligible) return true;
  }
  return false;
}

/** @dev System prompt for the "done or dig deeper?" judgment. Generic — no event-type rules. */
const PLANNER_SYSTEM = `You direct an event-monitoring investigation. A watch describes a real-world event; a check just searched the web and judged each result. Decide what to do next.

Return ONLY valid JSON:
{
  "action": "done" | "dig_deeper",
  "use_follow_up_queries": true | false,
  "revisit_urls": ["..."],
  "recheck_after_hours": number 1-24 or null,
  "reasoning": "one or two sentences"
}

Guidance:
- "dig_deeper" runs the plan's follow-up queries and/or re-fetches the listed pages RIGHT NOW, once. Use it when evidence is ambiguous, thin, or one plausible trigger needs a second source.
- revisit_urls may ONLY contain URLs from the "Pages eligible for re-check" list. Choose pages likely to have been updated with the outcome (official data pages, results pages, live summaries).
- recheck_after_hours schedules the NEXT check. Think about when the event will plausibly be resolved and confirmable: if the event window has not closed yet (e.g. an ongoing day, a count still in progress, an announcement expected later), pick a small number of hours after it should be confirmable. Use null when there is no reason to check before the normal daily run.
- "done" with recheck_after_hours null means nothing more is needed for now.
- Be economical: every search and re-check costs money. Do not dig deeper when evidence already clearly shows the event has not happened and nothing will change soon.`;

/** @dev Safe default when the planner model call fails: do nothing extra. */
const SAFE_DEFAULT: NextAction = {
  action: "done",
  use_follow_up_queries: false,
  revisit_urls: [],
  recheck_after_hours: null,
  reasoning: "Planner unavailable; deferring to normal daily cadence.",
};

/**
 * @notice Ask the AI what to do after a check round that did not notify.
 * @dev Output is schema-validated and clamped; revisit URLs are restricted to
 *      the eligible list. Any failure returns a do-nothing default.
 * @param args.eligibleRevisitUrls Pre-validated URLs the AI may pick from.
 * @param args.followUpQueriesAvailable False when follow-ups already ran this check.
 */
export async function decideNextAction(args: {
  spec: WatchSpec;
  plan: MonitoringPlan;
  decision: DecideResult;
  evidence: EvidenceRecord[];
  eligibleRevisitUrls: string[];
  followUpQueriesAvailable: boolean;
  now: string;
}): Promise<NextAction> {
  const {
    spec,
    plan,
    decision,
    evidence,
    eligibleRevisitUrls,
    followUpQueriesAvailable,
    now,
  } = args;

  const evidenceLines =
    evidence.length === 0
      ? "(no candidates survived filtering)"
      : evidence
          .map(
            (e) =>
              `- ${e.candidate.domain} | ${e.detection.verdict} (${e.detection.confidence.toFixed(2)}) | published ${e.candidate.published_at} | event date claimed: ${e.detection.event_date_claimed ?? "none"} | ${e.candidate.url}\n  judge: ${e.detection.reasoning.slice(0, 200)}`,
          )
          .join("\n");

  const userPrompt = `Current time: ${now}
Watch created at: ${spec.created_at}

Watched event:
${spec.clarified_statement}

Decision so far: notify=${decision.should_notify}, top verdict=${decision.top_verdict}, needs corroboration=${decision.needs_corroboration}
Decision reasoning: ${decision.reasoning}

Evidence from this check:
${evidenceLines}

Follow-up queries ${followUpQueriesAvailable && plan.follow_up_queries.length > 0 ? `available: ${plan.follow_up_queries.join(" | ")}` : "NOT available (already used or none defined)"}

Pages eligible for re-check:
${eligibleRevisitUrls.length > 0 ? eligibleRevisitUrls.map((u) => `- ${u}`).join("\n") : "(none)"}

What should the monitor do next?`;

  try {
    const { parsed } = await completeJson<unknown>(PLANNER_SYSTEM, userPrompt);
    const action = NextActionSchema.parse(parsed);

    const eligibleNormalized = new Set(
      eligibleRevisitUrls.map((u) => normalizeUrl(u)),
    );
    return {
      ...action,
      use_follow_up_queries:
        action.use_follow_up_queries &&
        followUpQueriesAvailable &&
        plan.follow_up_queries.length > 0,
      revisit_urls: action.revisit_urls
        .filter((u) => eligibleNormalized.has(normalizeUrl(u)))
        .slice(0, PLAN_MAX_REVISIT_URLS_PER_ROUND),
      reasoning: action.reasoning.slice(0, 500),
    };
  } catch (err) {
    console.error("[plan] next-action call failed; using safe default", err);
    return SAFE_DEFAULT;
  }
}
