/**
 * @title Watch findings
 * @notice Shared findings payload for trigger emails and the dashboard detail view.
 * @dev Summary is model-written at notify time and stored on the check; evidence comes from the check trail.
 */
import { z } from "zod";
import { completeJson } from "@/lib/inference";
import type { DecideResult, EvidenceRecord } from "@/lib/decide";

/** @dev One source shown in email and on the findings page. */
export interface FindingsSource {
  url: string;
  domain: string;
  title: string;
  snippet: string;
  confidence: number | null;
  reasoning: string;
  publishedAt: string | null;
}

/** @dev Canonical findings object shared by email + UI. */
export interface WatchFindings {
  watchId: string;
  checkId: string | null;
  rawInput: string;
  clarified: string;
  decideReasoning: string;
  summary: string;
  confidence: number | null;
  triggeredAt: string | null;
  sources: FindingsSource[];
}

const FindingsSummarySchema = z.object({
  summary: z.string().min(1),
});

/**
 * @notice Map TRIGGERED evidence records into FindingsSource rows.
 */
export function sourcesFromEvidence(
  evidence: EvidenceRecord[],
): FindingsSource[] {
  return evidence
    .filter((e) => e.detection.verdict === "TRIGGERED")
    .sort((a, b) => b.detection.confidence - a.detection.confidence)
    .map((e) => ({
      url: e.candidate.url,
      domain: e.candidate.domain,
      title: e.candidate.title || e.candidate.domain,
      snippet: e.candidate.snippet,
      confidence: e.detection.confidence,
      reasoning: e.detection.reasoning,
      publishedAt: e.candidate.published_at,
    }));
}

/**
 * @notice Deterministic fallback when the model summary call fails.
 */
export function fallbackFindingsSummary(
  decideReasoning: string,
  sources: FindingsSource[],
): string {
  if (sources.length === 0) {
    return decideReasoning || "PhraseAlert confirmed a match for your watch.";
  }
  const top = sources[0];
  const extras =
    sources.length > 1
      ? ` Additional confirming coverage appeared on ${sources
          .slice(1, 3)
          .map((s) => s.domain)
          .join(" and ")}.`
      : "";
  const detail = top.reasoning.trim()
    ? ` ${top.reasoning.trim().replace(/\s+/g, " ").slice(0, 280)}`
    : "";
  return `We found confirming coverage on ${top.domain}.${detail}${extras}`.trim();
}

/**
 * @notice Ask the model to write a concise user-facing findings summary.
 * @dev Soft-fails to fallbackFindingsSummary on inference or parse errors.
 */
export async function generateFindingsSummary(input: {
  rawInput: string;
  clarified: string;
  decideReasoning: string;
  sources: FindingsSource[];
}): Promise<string> {
  const sourceBlock = input.sources
    .slice(0, 5)
    .map(
      (s, i) =>
        `${i + 1}. ${s.title} (${s.domain})\nURL: ${s.url}\nSnippet: ${s.snippet.slice(0, 280)}\nFinding: ${s.reasoning}`,
    )
    .join("\n\n");

  try {
    const { parsed } = await completeJson<{ summary: string }>(
      `You write brief alert emails for PhraseAlert.
Return JSON only: { "summary": string }
The summary must be 2-4 sentences, concrete, and grounded only in the provided sources.
Mention domains by name. Do not invent facts, dates, or URLs. No greeting or sign-off.`,
      `Watch: ${input.rawInput}
Clarified: ${input.clarified || "(none)"}
Decision: ${input.decideReasoning}

Sources:
${sourceBlock || "(none)"}`,
    );
    const summary = FindingsSummarySchema.parse(parsed).summary.trim();
    return (
      summary || fallbackFindingsSummary(input.decideReasoning, input.sources)
    );
  } catch (err) {
    console.warn("[findings] summary generation failed; using fallback", err);
    return fallbackFindingsSummary(input.decideReasoning, input.sources);
  }
}

/**
 * @notice Build findings at notify time from the decide result + model summary.
 */
export async function buildFindingsForNotify(input: {
  watchId: string;
  checkId: string;
  rawInput: string;
  clarified: string;
  decision: DecideResult;
}): Promise<WatchFindings> {
  const sources = sourcesFromEvidence(input.decision.evidence);
  const summary = await generateFindingsSummary({
    rawInput: input.rawInput,
    clarified: input.clarified,
    decideReasoning: input.decision.reasoning,
    sources,
  });

  return {
    watchId: input.watchId,
    checkId: input.checkId,
    rawInput: input.rawInput,
    clarified: input.clarified,
    decideReasoning: input.decision.reasoning,
    summary,
    confidence: input.decision.top_confidence,
    triggeredAt: new Date().toISOString(),
    sources,
  };
}

/**
 * @notice Format the shared findings payload as plain-text email body lines.
 */
export function formatFindingsEmailText(
  findings: WatchFindings,
  detailUrl: string,
): string {
  const sourceLines =
    findings.sources.length === 0
      ? ["(no evidence links)"]
      : findings.sources.slice(0, 5).flatMap((s, i) => {
          const lines = [`${i + 1}. ${s.title} — ${s.domain}`, `   ${s.url}`];
          if (s.snippet) {
            lines.push(`   ${s.snippet.replace(/\s+/g, " ").slice(0, 220)}`);
          }
          if (s.reasoning) {
            lines.push(
              `   Finding: ${s.reasoning.replace(/\s+/g, " ").slice(0, 320)}`,
            );
          }
          return lines;
        });

  return [
    "PhraseAlert found evidence that matches your watch.",
    "",
    `Watch: ${findings.rawInput}`,
    ...(findings.clarified ? [`Clarified: ${findings.clarified}`, ""] : [""]),
    "What we found:",
    findings.summary,
    "",
    `Why it matched: ${findings.decideReasoning}`,
    "",
    "Sources:",
    ...sourceLines,
    "",
    `View full findings: ${detailUrl}`,
  ].join("\n");
}
