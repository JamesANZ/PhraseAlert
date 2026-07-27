/**
 * @title PhraseAlert core types
 * @notice Shared Zod schemas and TypeScript types for watches, detection, retrieval, and eval fixtures.
 * @dev All runtime validation flows through these schemas. API routes and the judgment pipeline import from here.
 * @custom:phase 1
 */
import { z } from "zod";

/** @notice Lifecycle state of a saved watch. @dev Only `watching` counts toward active-watch limits; `paused` and `triggered` do not. */
export const WatchStatusSchema = z.enum(["watching", "triggered", "paused"]);

/** @notice How often a watch is scheduled for retrieval and judgment. */
export const CheckFrequencySchema = z.enum([
  "daily",
  "every_6h",
  "hourly",
  "every_15m",
]);

/** @dev Hard caps on AI-authored monitoring plans so bad model output cannot blow up cost. */
export const PLAN_MAX_QUERIES = 4;
export const PLAN_MAX_QUERY_LENGTH = 200;
export const PLAN_MAX_REVISIT_DOMAINS = 10;
export const PLAN_MAX_REVISITS_PER_URL = 3;
export const PLAN_MAX_REVISIT_URLS_PER_ROUND = 3;
export const PLAN_MAX_RECHECK_HOURS = 24;

/**
 * @notice Which previously seen pages may be fetched and judged again.
 * @dev Default is "never re-check" (today's behavior). The AI can allow it for
 *      sources that update in place (official data pages, results pages).
 */
export const RevisitPolicySchema = z.object({
  allowed: z.boolean().default(false),
  domains: z
    .array(z.string().min(1).max(100))
    .max(PLAN_MAX_REVISIT_DOMAINS)
    .default([]),
  max_revisits_per_url: z
    .number()
    .int()
    .min(0)
    .max(PLAN_MAX_REVISITS_PER_URL)
    .default(2),
});
export type RevisitPolicy = z.infer<typeof RevisitPolicySchema>;

/**
 * @title MonitoringPlan
 * @notice AI-written plan for how to monitor one watch: normal searches, backup
 *         searches for when results are weak, and the page re-check policy.
 * @dev Attached to WatchSpec at compile time. All fields are capped server-side.
 */
export const MonitoringPlanSchema = z.object({
  plan_version: z.literal(1).default(1),
  baseline_queries: z
    .array(z.string().min(3).max(PLAN_MAX_QUERY_LENGTH))
    .min(1)
    .max(PLAN_MAX_QUERIES),
  follow_up_queries: z
    .array(z.string().min(3).max(PLAN_MAX_QUERY_LENGTH))
    .max(PLAN_MAX_QUERIES)
    .default([]),
  revisit: RevisitPolicySchema.default({
    allowed: false,
    domains: [],
    max_revisits_per_url: 2,
  }),
});
export type MonitoringPlan = z.infer<typeof MonitoringPlanSchema>;

/** @dev Follow-up work the AI queued for a future run (executed on the next due hourly tick). */
export const PendingActionsSchema = z.object({
  use_follow_up_queries: z.boolean().default(false),
  revisit_urls: z
    .array(z.string())
    .max(PLAN_MAX_REVISIT_URLS_PER_ROUND)
    .default([]),
});
export type PendingActions = z.infer<typeof PendingActionsSchema>;

/**
 * @title PlanRuntimeState
 * @notice What the monitoring plan has done so far for a watch, saved between runs.
 * @dev Stored inside the watch's spec JSON (no schema migration). Drives the
 *      hourly cron guard and per-URL re-check budgets.
 */
export const PlanRuntimeStateSchema = z.object({
  last_check_at: z.string().optional(),
  pending_follow_up: z.boolean().default(false),
  next_eligible_at: z.string().nullable().default(null),
  pending_actions: PendingActionsSchema.nullable().default(null),
  planner_note: z.string().max(500).nullable().default(null),
  url_revisits: z
    .record(
      z.string(),
      z.object({ count: z.number().int().min(0), last_at: z.string() }),
    )
    .default({}),
});
export type PlanRuntimeState = z.infer<typeof PlanRuntimeStateSchema>;

/**
 * @notice The AI's answer to "are we done, or should we dig deeper?" after a check round.
 * @dev revisit_urls are validated against the plan's revisit policy and budgets before use.
 *      recheck_after_hours schedules a follow-up run; null means wait for the normal daily run.
 */
export const NextActionSchema = z.object({
  action: z.enum(["done", "dig_deeper"]),
  use_follow_up_queries: z.boolean().default(false),
  revisit_urls: z.array(z.string()).default([]),
  recheck_after_hours: z
    .number()
    .min(0.25)
    .max(PLAN_MAX_RECHECK_HOURS)
    .nullable()
    .default(null),
  reasoning: z.string().max(1000).default(""),
});
export type NextAction = z.infer<typeof NextActionSchema>;

/**
 * @title WatchSpec
 * @notice Structured specification produced when a user's sentence is compiled into a monitorable watch.
 * @dev Persisted as JSON on the `watches` row. Drives search queries, detection prompts, and notification rules.
 * @custom:pipeline compile → retrieve → filter → detect → decide
 */
export const WatchSpecSchema = z.object({
  id: z.string(),
  user_id: z.string().optional(),
  raw_input: z.string(),
  clarified_statement: z.string(),
  trigger_conditions: z.array(z.string()).min(1),
  non_triggers: z.array(z.string()).min(1),
  entities: z.array(z.string()),
  search_queries: z.array(z.string()).min(1),
  authoritative_domains: z.array(z.string()),
  /** @dev AI-written monitoring plan; absent on legacy watches (fallback derives from search_queries). */
  monitoring_plan: MonitoringPlanSchema.optional(),
  /** @dev Mutable plan state updated after each check; absent until the first plan-aware run. */
  plan_state: PlanRuntimeStateSchema.optional(),
  created_at: z.string().datetime({ offset: true }),
  check_frequency: CheckFrequencySchema.default("daily"),
  status: WatchStatusSchema.default("watching"),
});
export type WatchSpec = z.infer<typeof WatchSpecSchema>;

/**
 * @title VaguenessResult
 * @notice Outcome of the vagueness gate before a watch can be saved.
 * @dev CLEAR proceeds to compilation; VAGUE returns up to three concrete alternative sentences.
 */
export const VaguenessResultSchema = z.object({
  classification: z.enum(["CLEAR", "VAGUE"]),
  interpretations: z.array(z.string()).max(3).optional(),
  reasoning: z.string().optional(),
});
export type VaguenessResult = z.infer<typeof VaguenessResultSchema>;

/**
 * @notice Per-source judgment on whether credible evidence shows the watched event occurred.
 * @dev TRIGGERED does not alone imply notification — `decideFromEvidence` applies corroboration rules.
 */
export const VerdictSchema = z.enum([
  "TRIGGERED",
  "NOT_TRIGGERED",
  "AMBIGUOUS",
]);
export type Verdict = z.infer<typeof VerdictSchema>;

/** @notice LLM output for a single retrieval candidate against a WatchSpec. */
export const DetectionResultSchema = z.object({
  verdict: VerdictSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  event_date_claimed: z.string().nullable().optional(),
});
export type DetectionResult = z.infer<typeof DetectionResultSchema>;

/**
 * @title RetrievalCandidate
 * @notice A web page (or fixture) candidate passed to the detector after retrieval and filtering.
 * @dev `published_at` must be on or after watch creation for the candidate to survive filtering.
 */
export const RetrievalCandidateSchema = z.object({
  url: z.string().url(),
  domain: z.string(),
  title: z.string(),
  snippet: z.string(),
  published_at: z.string().datetime({ offset: true }),
  retrieval_source: z
    .enum(["fixture", "tavily", "brave", "rss"])
    .default("fixture"),
});
export type RetrievalCandidate = z.infer<typeof RetrievalCandidateSchema>;

/** @dev Backdated eval fixture: labeled candidate with optional expected verdict for regression scoring. */
export const EvalFixtureSchema = z.object({
  label: z.enum(["positive", "negative", "distractor"]),
  candidate: RetrievalCandidateSchema,
  expect_verdict: VerdictSchema.optional(),
});

/**
 * @title EvalEvent
 * @notice A historical scenario used by the eval harness to score detection quality without live retrieval.
 */
export const EvalEventSchema = z.object({
  id: z.string(),
  description: z.string(),
  raw_input: z.string(),
  clarified_statement: z.string().optional(),
  created_at: z.string().datetime({ offset: true }),
  known_event_date: z.string().datetime({ offset: true }).nullable(),
  expected_outcome: z.enum(["should_trigger", "should_not_trigger"]),
  known_answer: z.string().optional(),
  fixtures: z.array(EvalFixtureSchema),
});
export type EvalEvent = z.infer<typeof EvalEventSchema>;

export const EvalEventsFileSchema = z.object({
  events: z.array(EvalEventSchema),
});

/** @dev Aggregate metrics returned by `evals/run.ts` after fixture and dialogue runs. */
export interface EvalScores {
  detection_rate: number;
  false_positive_rate: number;
  filter_precision: number;
  total_fixtures: number;
  triggered_count: number;
  should_trigger_events: number;
  should_trigger_detected: number;
  should_not_trigger_events: number;
  should_not_trigger_false_positives: number;
  distractors_dropped: number;
  distractors_total: number;
}

/** @dev One turn in a multi-step vagueness/clarification smoke dialogue eval. */
export const DialogueStepSchema = z.object({
  input: z.string(),
  expect_classification: z.enum(["CLEAR", "VAGUE"]),
  expect_suggestion_keywords: z.array(z.string()).optional(),
  expect_compile: z.boolean().optional(),
  expect_domain_keywords: z.array(z.string()).optional(),
});

export const EvalDialogueSchema = z.object({
  id: z.string(),
  description: z.string(),
  steps: z.array(DialogueStepSchema).min(1),
});
export type EvalDialogue = z.infer<typeof EvalDialogueSchema>;

export const EvalDialoguesFileSchema = z.object({
  dialogues: z.array(EvalDialogueSchema),
});

/**
 * @title RevisitEvalCase
 * @notice Eval scenario where the same URL's content changes between two checks
 *         (the rain-alert shape): pass 1 shows no outcome, pass 2 shows it.
 * @dev Verifies default seen-URL blocking, plan-approved re-check, and detector judgment.
 */
export const RevisitEvalCaseSchema = z.object({
  id: z.string(),
  description: z.string(),
  spec: WatchSpecSchema,
  pass1: EvalFixtureSchema,
  pass2: EvalFixtureSchema,
});
export type RevisitEvalCase = z.infer<typeof RevisitEvalCaseSchema>;

export const RevisitEvalFileSchema = z.object({
  cases: z.array(RevisitEvalCaseSchema),
});

/**
 * @title LiveRetrievalCase
 * @notice Integration eval that hits Tavily with real queries and exercises the full check pipeline.
 */
export const LiveRetrievalCaseSchema = z.object({
  id: z.string(),
  description: z.string(),
  raw_input: z.string(),
  clarified_statement: z.string().optional(),
  created_at: z.string().datetime({ offset: true }),
  require_min_retrieved: z.number().int().min(1).default(1),
  require_min_after_filter: z.number().int().min(0).default(1),
  expect_any_triggered: z.boolean().default(false),
  max_candidates_to_judge: z.number().int().min(1).max(8).default(5),
});
export type LiveRetrievalCase = z.infer<typeof LiveRetrievalCaseSchema>;

export const LiveRetrievalFileSchema = z.object({
  cases: z.array(LiveRetrievalCaseSchema),
});
