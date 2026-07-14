/**
 * @title Bellwether core types
 * @notice Shared Zod schemas and TypeScript types for watches, detection, retrieval, and eval fixtures.
 * @dev All runtime validation flows through these schemas. API routes and the judgment pipeline import from here.
 * @custom:phase 1
 */
import { z } from "zod";

/** @notice Lifecycle state of a saved watch. @dev `paused` watches are excluded from cron checks and active-watch limits. */
export const WatchStatusSchema = z.enum(["watching", "triggered", "paused"]);
export type WatchStatus = z.infer<typeof WatchStatusSchema>;

/** @notice How often a watch is scheduled for retrieval and judgment. @dev Hourly is reserved for future tiers. */
export const CheckFrequencySchema = z.enum(["daily", "hourly"]);
export type CheckFrequency = z.infer<typeof CheckFrequencySchema>;

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
export type EvalFixture = z.infer<typeof EvalFixtureSchema>;

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
export type EvalEventsFile = z.infer<typeof EvalEventsFileSchema>;

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
export type DialogueStep = z.infer<typeof DialogueStepSchema>;

export const EvalDialogueSchema = z.object({
  id: z.string(),
  description: z.string(),
  steps: z.array(DialogueStepSchema).min(1),
});
export type EvalDialogue = z.infer<typeof EvalDialogueSchema>;

export const EvalDialoguesFileSchema = z.object({
  dialogues: z.array(EvalDialogueSchema),
});
export type EvalDialoguesFile = z.infer<typeof EvalDialoguesFileSchema>;

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
export type LiveRetrievalFile = z.infer<typeof LiveRetrievalFileSchema>;
