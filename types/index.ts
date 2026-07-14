import { z } from "zod";

export const WatchStatusSchema = z.enum(["watching", "triggered", "paused"]);
export type WatchStatus = z.infer<typeof WatchStatusSchema>;

export const CheckFrequencySchema = z.enum(["daily", "hourly"]);
export type CheckFrequency = z.infer<typeof CheckFrequencySchema>;

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

export const VaguenessResultSchema = z.object({
  classification: z.enum(["CLEAR", "VAGUE"]),
  interpretations: z.array(z.string()).max(3).optional(),
  reasoning: z.string().optional(),
});
export type VaguenessResult = z.infer<typeof VaguenessResultSchema>;

export const VerdictSchema = z.enum([
  "TRIGGERED",
  "NOT_TRIGGERED",
  "AMBIGUOUS",
]);
export type Verdict = z.infer<typeof VerdictSchema>;

export const DetectionResultSchema = z.object({
  verdict: VerdictSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  event_date_claimed: z.string().nullable().optional(),
});
export type DetectionResult = z.infer<typeof DetectionResultSchema>;

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

export const EvalFixtureSchema = z.object({
  label: z.enum(["positive", "negative", "distractor"]),
  candidate: RetrievalCandidateSchema,
  expect_verdict: VerdictSchema.optional(),
});
export type EvalFixture = z.infer<typeof EvalFixtureSchema>;

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
