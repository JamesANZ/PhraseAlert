/**
 * @title Watch compiler
 * @notice Turns a plain-language watch sentence into a structured WatchSpec, with a vagueness gate first.
 * @dev Phase 1 judgment layer. Uses Hugging Face chat completion via `completeJson` with strict system prompts.
 * @custom:pipeline step 1 — compile
 */
import { z } from "zod";
import { completeJson } from "./inference";
import {
  VaguenessResultSchema,
  WatchSpecSchema,
  type VaguenessResult,
  type WatchSpec,
} from "@/types";

/** @dev System prompt for the vagueness classifier. Conservative: prefers VAGUE when unsure. */
const VAGUENESS_SYSTEM = `You assess whether a user's event-watch sentence is specific enough to monitor.
Return ONLY valid JSON with this shape:
{
  "classification": "CLEAR" | "VAGUE",
  "interpretations": ["concrete watch sentence 1", "..."] (only when VAGUE, max 3),
  "reasoning": "brief explanation"
}

STRICT rules — be conservative. Prefer VAGUE when unsure.

Invariant:
- If you would suggest any tighter alternative sentences, you MUST classify VAGUE and return those as interpretations.
- CLEAR means you are fully satisfied: return classification CLEAR with NO interpretations array (omit it or use []).
- Never return interpretations with CLEAR.

VAGUE (reject for monitoring) when ANY of these apply:
- Topic or keyword only (e.g. "Bitcoin", "visas", "interest rates", "Australian visa") with no concrete outcome
- Missing threshold, direction, actor, jurisdiction, or scope needed for a yes/no event
- Multiple plausible events could match the same sentence
- Broader than a single monitorable outcome (would match endless related news)
- You can invent concrete tighter watch sentences that would reduce ambiguity

CLEAR only when ALL of these apply:
- One unambiguous real-world event a human could mark yes/no after the fact
- Specific entity/instrument AND specific change, threshold, or outcome
- Scope included when multiple commonly monitored variants exist (e.g. onshore vs offshore partner visa, visa subclass, country/jurisdiction, which rate or fee)
- Low interpretation branching — a searcher would know what counts as the event
- No useful tighter alternatives are needed

Partner visa, student visa, or similar government products without onshore/offshore (or equivalent path/subclass) scope are VAGUE even if fees/eligibility are mentioned.

When VAGUE, interpretations must be concrete candidate watch sentences the user can pick
(each more specific than the input). Do NOT return open questions alone.
Examples of good interpretations: "Notify me when Bitcoin passes $100,000",
"Tell me if Australian onshore partner visa application fees increase".`;

/** @dev System prompt for WatchSpec body generation (trigger/non-trigger conditions, queries, domains). */
const COMPILE_SYSTEM = `You compile event watches into structured JSON for a monitoring system.
Return ONLY valid JSON matching this schema:
{
  "clarified_statement": "precise statement of what counts as the event happening",
  "trigger_conditions": ["..."],
  "non_triggers": ["..."],
  "entities": ["..."],
  "search_queries": ["..."],
  "authoritative_domains": ["..."]
}
non_triggers is critical: list coverage that should NOT fire the watch (guides, speculation, predictions, unrelated events, live dashboards without the event, and recaps or historical reporting that the event already occurred before the watch was created).
Do NOT list factual post-watch reporting that the watched event newly occurred as a non-trigger.
search_queries should be 2-4 concrete web search phrases that find evidence the event OCCURRED
(results, winner declared, threshold crossed, official confirmation). Prefer event/result phrasing with year or outcome words.
NEVER use live-dashboard queries such as "price today", "current value", "live chart", or "live score".
authoritative_domains should be official or primary news/data sources where applicable.`;

/**
 * @notice Enforce: suggestions always mean VAGUE; CLEAR never carries interpretations.
 * @dev Exported for unit tests; applied at the end of assessVagueness.
 */
export function enforceVaguenessInvariant(
  result: VaguenessResult,
): VaguenessResult {
  const interpretations = (result.interpretations ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (interpretations.length > 0) {
    return {
      ...result,
      classification: "VAGUE",
      interpretations,
    };
  }

  return {
    classification: result.classification,
    reasoning: result.reasoning,
  };
}

/** @dev Zod subset of WatchSpec fields the model is allowed to produce (metadata added in code). */
const CompiledSpecBodySchema = WatchSpecSchema.omit({
  id: true,
  user_id: true,
  raw_input: true,
  created_at: true,
  check_frequency: true,
  status: true,
});

/**
 * @notice Classify whether a watch sentence is specific enough to monitor.
 * @dev First step in watch creation. Returns VAGUE with suggested concrete alternatives when rejected.
 * @param rawInput User's watch sentence (3–500 chars at API layer).
 * @return VaguenessResult with CLEAR or VAGUE classification.
 */
export async function assessVagueness(
  rawInput: string,
): Promise<VaguenessResult> {
  const { parsed } = await completeJson<unknown>(
    VAGUENESS_SYSTEM,
    `Assess this watch sentence:\n"${rawInput}"`,
  );
  return enforceVaguenessInvariant(VaguenessResultSchema.parse(parsed));
}

/**
 * @notice Compile a cleared watch sentence into a full WatchSpec ready for persistence.
 * @dev Assigns id, user_id, created_at, check_frequency, and status unless overridden in options.
 * @param rawInput Original user input (preserved on the spec).
 * @param options.clarifiedStatement Final unambiguous statement after clarification.
 * @param options.createdAt ISO timestamp anchoring the post-watch-only filter.
 * @param options.id Optional watch id (defaults to `w_<uuid8>`).
 * @param options.userId Owner user id.
 * @return Validated WatchSpec.
 */
export async function compileWatchSpec(
  rawInput: string,
  options: {
    clarifiedStatement?: string;
    createdAt?: string;
    id?: string;
    userId?: string;
  } = {},
): Promise<WatchSpec> {
  const clarified = options.clarifiedStatement ?? rawInput;
  const { parsed } = await completeJson<unknown>(
    COMPILE_SYSTEM,
    `Raw input: "${rawInput}"
Clarified statement: "${clarified}"

Compile this into a Watch Spec body.`,
  );

  const body = CompiledSpecBodySchema.parse({
    ...(parsed as Record<string, unknown>),
    clarified_statement: clarified,
  });

  return WatchSpecSchema.parse({
    ...body,
    id: options.id ?? `w_${crypto.randomUUID().slice(0, 8)}`,
    user_id: options.userId ?? "eval_user",
    raw_input: rawInput,
    created_at: options.createdAt ?? new Date().toISOString(),
    check_frequency: "daily",
    status: "watching",
  });
}

/**
 * @notice Combined vagueness check and compile for eval harness and smoke tests.
 * @dev Skips compilation when classification is VAGUE.
 * @param rawInput Watch sentence.
 * @param createdAt Fixed timestamp for reproducible eval runs.
 * @return Vagueness result and optional compiled spec.
 */
export async function compileWithClarification(
  rawInput: string,
  createdAt: string,
): Promise<{ vagueness: VaguenessResult; spec?: WatchSpec }> {
  const vagueness = await assessVagueness(rawInput);
  if (vagueness.classification === "VAGUE") {
    return { vagueness };
  }
  const spec = await compileWatchSpec(rawInput, { createdAt });
  return { vagueness, spec };
}
