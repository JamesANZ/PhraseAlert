import { z } from "zod";
import { completeJson } from "./inference.js";
import {
  VaguenessResultSchema,
  WatchSpecSchema,
  type VaguenessResult,
  type WatchSpec,
} from "../types/index.js";

const VAGUENESS_SYSTEM = `You assess whether a user's event-watch sentence is clear enough to monitor.
Return ONLY valid JSON with this shape:
{
  "classification": "CLEAR" | "VAGUE",
  "interpretations": ["Did you mean ...", "..."] (only when VAGUE, max 3),
  "reasoning": "brief explanation"
}
CLEAR means a single unambiguous event with identifiable trigger conditions.
VAGUE means multiple plausible interpretations, missing scope, or unclear trigger.`;

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
