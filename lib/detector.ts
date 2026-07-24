/**
 * @title Event detector
 * @notice Judges whether a single web source shows the watched event actually occurred.
 * @dev Phase 1 judgment layer. Not keyword matching — requires credible evidence of the event post-watch.
 * @custom:pipeline step 3 — detect
 */
import { completeJson } from "./inference";
import {
  DetectionResultSchema,
  type DetectionResult,
  type RetrievalCandidate,
  type WatchSpec,
} from "@/types";

/** @dev System prompt for per-candidate TRIGGERED / NOT_TRIGGERED / AMBIGUOUS classification. */
const DETECT_SYSTEM = `You decide whether a web source shows that a watched event has ACTUALLY occurred AFTER the watch was created.
You are not doing keyword matching. The event must have happened per the source, not merely be discussed.

Return ONLY valid JSON:
{
  "verdict": "TRIGGERED" | "NOT_TRIGGERED" | "AMBIGUOUS",
  "confidence": 0.0 to 1.0,
  "reasoning": "one paragraph",
  "event_date_claimed": "ISO date or datetime if the source states when the event occurred, else null"
}

TRIGGERED only when ALL apply:
- Credible confirmation the watched event actually occurred (official announcement, reported outcome, threshold crossed)
- The occurrence is on or after the watch created timestamp
- Not speculation, prediction, rumor, or related discussion without confirmation

NOT_TRIGGERED when ANY apply:
- Related coverage but the event has not happened
- Speculation, prediction, polls, guides, or live dashboards showing a current number without confirming the discrete event
- The source affirms the event happened BEFORE the watch was created (including fresh recaps of older events)
- The article is new but only restates a pre-watch outcome

AMBIGUOUS: plausible post-watch trigger but insufficient certainty from this source alone.

Always set event_date_claimed when the source states when the event occurred (prefer ISO date or datetime). Use null only when no event date is stated.`;

/**
 * @notice Run detection for one retrieval candidate against a WatchSpec.
 * @dev Includes trigger/non-trigger conditions and watch creation timestamp in the user prompt.
 * @param spec Compiled watch specification.
 * @param candidate Filtered web source to evaluate.
 * @return DetectionResult plus the HF model id used for this call.
 */
export async function detectEvent(
  spec: WatchSpec,
  candidate: RetrievalCandidate,
): Promise<DetectionResult & { model: string }> {
  const userPrompt = `Watch created at: ${spec.created_at}

Clarified statement:
${spec.clarified_statement}

Trigger conditions:
${spec.trigger_conditions.map((c) => `- ${c}`).join("\n")}

Non-triggers (do NOT fire on these):
${spec.non_triggers.map((c) => `- ${c}`).join("\n")}

Candidate source:
- Domain: ${candidate.domain}
- Published: ${candidate.published_at}
- Title: ${candidate.title}
- Snippet: ${candidate.snippet}
- URL: ${candidate.url}

Did this source confirm the watched event actually occurred on or after watch creation?
If the event happened earlier, verdict must be NOT_TRIGGERED even if the article is recent.`;

  const { parsed, model } = await completeJson<unknown>(
    DETECT_SYSTEM,
    userPrompt,
  );
  const result = DetectionResultSchema.parse(parsed);
  return { ...result, model };
}
