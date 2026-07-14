import { z } from "zod";
import { completeJson } from "./inference";
import {
  VaguenessResultSchema,
  WatchSpecSchema,
  type VaguenessResult,
  type WatchSpec,
} from "@/types";

const VAGUENESS_SYSTEM = `You assess whether a user's event-watch sentence is specific enough to monitor.
Return ONLY valid JSON with this shape:
{
  "classification": "CLEAR" | "VAGUE",
  "interpretations": ["concrete watch sentence 1", "..."] (only when VAGUE, max 3),
  "reasoning": "brief explanation"
}

STRICT rules — be conservative. Prefer VAGUE when unsure.

VAGUE (reject for monitoring) when ANY of these apply:
- Topic or keyword only (e.g. "Bitcoin", "visas", "interest rates", "Australian visa") with no concrete outcome
- Missing threshold, direction, actor, jurisdiction, or scope needed for a yes/no event
- Multiple plausible events could match the same sentence
- Broader than a single monitorable outcome (would match endless related news)

CLEAR only when ALL of these apply:
- One unambiguous real-world event a human could mark yes/no after the fact
- Specific entity/instrument AND specific change, threshold, or outcome
- Scope included when multiple commonly monitored variants exist (e.g. onshore vs offshore partner visa, visa subclass, country/jurisdiction, which rate or fee)
- Low interpretation branching — a searcher would know what counts as the event

Partner visa, student visa, or similar government products without onshore/offshore (or equivalent path/subclass) scope are VAGUE even if fees/eligibility are mentioned.

When VAGUE, interpretations must be concrete candidate watch sentences the user can pick
(each more specific than the input). Do NOT return open questions alone.
Examples of good interpretations: "Notify me when Bitcoin passes $100,000",
"Tell me if Australian onshore partner visa application fees increase".`;

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
non_triggers is critical: list coverage that should NOT fire the watch (guides, speculation, unrelated events).
search_queries should be 2-4 concrete web search phrases.
authoritative_domains should be official or primary sources where applicable.`;

const CompiledSpecBodySchema = WatchSpecSchema.omit({
  id: true,
  user_id: true,
  raw_input: true,
  created_at: true,
  check_frequency: true,
  status: true,
});

export async function assessVagueness(
  rawInput: string,
): Promise<VaguenessResult> {
  const { parsed } = await completeJson<unknown>(
    VAGUENESS_SYSTEM,
    `Assess this watch sentence:\n"${rawInput}"`,
  );
  return VaguenessResultSchema.parse(parsed);
}

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
