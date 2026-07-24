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

/** @dev Common page-chrome / nav noise that slips into extracted snippets. */
const SNIPPET_NOISE_RE =
  /always light|always dark|follow system|berita bahasa|tok pisin|advertisement|maximum number of saved items|new intelligent search|abc iview|abc listen|中文新闻|breakingworld|you have reached your maximum/i;

/**
 * @notice Normalize text for display: strip markdown chrome and collapse whitespace.
 */
export function cleanDisplayText(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*_`>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @notice Truncate at a sentence or word boundary instead of mid-word.
 */
export function softTruncate(text: string, max: number): string {
  const cleaned = cleanDisplayText(text);
  if (cleaned.length <= max) return cleaned;

  const slice = cleaned.slice(0, max);
  const sentenceEnd = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("? "),
    slice.lastIndexOf("! "),
  );
  if (sentenceEnd >= Math.floor(max * 0.45)) {
    return slice.slice(0, sentenceEnd + 1).trim();
  }
  const wordEnd = slice.lastIndexOf(" ");
  const clipped = (wordEnd > 40 ? slice.slice(0, wordEnd) : slice).trim();
  return `${clipped.replace(/[.,;:]+$/, "")}…`;
}

/**
 * @notice True when a snippet looks like real article text rather than site chrome.
 */
export function isUsefulSnippet(text: string): boolean {
  const cleaned = cleanDisplayText(text);
  if (cleaned.length < 48) return false;
  if (SNIPPET_NOISE_RE.test(cleaned)) return false;
  return true;
}

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
      title: cleanDisplayText(e.candidate.title || e.candidate.domain),
      snippet: cleanDisplayText(e.candidate.snippet),
      confidence: e.detection.confidence,
      reasoning: cleanDisplayText(e.detection.reasoning),
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
  const detail = top.reasoning
    ? ` ${softTruncate(top.reasoning, 220)}`
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
        `${i + 1}. ${s.title} (${s.domain})\nURL: ${s.url}\nFinding: ${softTruncate(s.reasoning || s.snippet, 280)}`,
    )
    .join("\n\n");

  try {
    const { parsed } = await completeJson<{ summary: string }>(
      `You write brief alert emails for PhraseAlert.
Return JSON only: { "summary": string }
The summary must be 2-4 complete sentences, concrete, and grounded only in the provided sources.
Mention domains by name. Do not invent facts, dates, or URLs. No greeting or sign-off.
Never cut a sentence off mid-word.`,
      `Watch: ${input.rawInput}
Clarified: ${input.clarified || "(none)"}
Decision: ${input.decideReasoning}

Sources:
${sourceBlock || "(none)"}`,
    );
    const summary = FindingsSummarySchema.parse(parsed).summary.trim();
    return (
      softTruncate(summary, 520) ||
      fallbackFindingsSummary(input.decideReasoning, input.sources)
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

function clarifiedDiffers(rawInput: string, clarified: string): boolean {
  return (
    Boolean(clarified.trim()) &&
    clarified.trim().toLowerCase() !== rawInput.trim().toLowerCase()
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @notice Format the shared findings payload as plain-text email body.
 */
export function formatFindingsEmailText(
  findings: WatchFindings,
  detailUrl: string,
): string {
  const sourceLines =
    findings.sources.length === 0
      ? ["(no evidence links)"]
      : findings.sources.slice(0, 5).flatMap((s, i) => {
          const lines = [
            `${i + 1}. ${s.title}`,
            `   ${s.domain}`,
            `   ${s.url}`,
          ];
          if (s.reasoning) {
            lines.push(`   ${softTruncate(s.reasoning, 240)}`);
          } else if (isUsefulSnippet(s.snippet)) {
            lines.push(`   ${softTruncate(s.snippet, 180)}`);
          }
          lines.push("");
          return lines;
        });

  return [
    "PhraseAlert found evidence that matches your watch.",
    "",
    `Watch: ${findings.rawInput}`,
    ...(clarifiedDiffers(findings.rawInput, findings.clarified)
      ? [`Clarified: ${findings.clarified}`, ""]
      : [""]),
    "What we found",
    findings.summary,
    "",
    "Why it matched",
    findings.decideReasoning,
    "",
    "Sources",
    ...sourceLines,
    `View full findings: ${detailUrl}`,
  ].join("\n");
}

/**
 * @notice HTML version of the trigger email — same content as plain text, easier to scan.
 */
export function formatFindingsEmailHtml(
  findings: WatchFindings,
  detailUrl: string,
): string {
  const sourcesHtml =
    findings.sources.length === 0
      ? "<p style=\"margin:0;color:#6b7280;\">(no evidence links)</p>"
      : `<ol style="margin:0;padding-left:20px;">${findings.sources
          .slice(0, 5)
          .map((s) => {
            const detail = s.reasoning
              ? softTruncate(s.reasoning, 240)
              : isUsefulSnippet(s.snippet)
                ? softTruncate(s.snippet, 180)
                : "";
            return `<li style="margin:0 0 16px;">
  <a href="${escapeHtml(s.url)}" style="color:#111827;font-weight:600;text-decoration:none;">${escapeHtml(s.title)}</a>
  <div style="margin-top:4px;color:#6b7280;font-size:13px;">${escapeHtml(s.domain)}</div>
  <div style="margin-top:2px;"><a href="${escapeHtml(s.url)}" style="color:#2563eb;font-size:13px;word-break:break-all;">${escapeHtml(s.url)}</a></div>
  ${
    detail
      ? `<div style="margin-top:8px;color:#374151;font-size:14px;line-height:1.5;">${escapeHtml(detail)}</div>`
      : ""
  }
</li>`;
          })
          .join("")}</ol>`;

  const clarifiedBlock = clarifiedDiffers(findings.rawInput, findings.clarified)
    ? `<p style="margin:8px 0 0;color:#6b7280;font-size:14px;"><strong>Clarified:</strong> ${escapeHtml(findings.clarified)}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:24px auto;padding:28px 24px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
    <p style="margin:0 0 20px;color:#111827;font-size:15px;line-height:1.5;">PhraseAlert found evidence that matches your watch.</p>

    <p style="margin:0;color:#111827;font-size:15px;line-height:1.5;"><strong>Watch:</strong> ${escapeHtml(findings.rawInput)}</p>
    ${clarifiedBlock}

    <h2 style="margin:24px 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">What we found</h2>
    <p style="margin:0;color:#111827;font-size:15px;line-height:1.6;">${escapeHtml(findings.summary)}</p>

    <h2 style="margin:24px 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Why it matched</h2>
    <p style="margin:0;color:#111827;font-size:15px;line-height:1.6;">${escapeHtml(findings.decideReasoning)}</p>

    <h2 style="margin:24px 0 12px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Sources</h2>
    ${sourcesHtml}

    <p style="margin:28px 0 0;">
      <a href="${escapeHtml(detailUrl)}" style="display:inline-block;padding:10px 16px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">View full findings</a>
    </p>
    <p style="margin:12px 0 0;color:#9ca3af;font-size:12px;word-break:break-all;">${escapeHtml(detailUrl)}</p>
  </div>
</body>
</html>`;
}
