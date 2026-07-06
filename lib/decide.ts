import type {
  DetectionResult,
  RetrievalCandidate,
  Verdict,
  WatchSpec,
} from "@/types";

export const TRIGGER_CONFIDENCE_THRESHOLD = 0.75;

export interface EvidenceRecord {
  candidate: RetrievalCandidate;
  detection: DetectionResult;
}

export interface DecideResult {
  should_notify: boolean;
  top_verdict: Verdict;
  top_confidence: number;
  evidence: EvidenceRecord[];
  needs_corroboration: boolean;
  reasoning: string;
}

function isAuthoritative(domain: string, spec: WatchSpec): boolean {
  const normalized = domain.toLowerCase().replace(/^www\./, "");
  return spec.authoritative_domains.some((d) => {
    const auth = d.toLowerCase().replace(/^www\./, "");
    return normalized === auth || normalized.endsWith(`.${auth}`);
  });
}

export function decideFromEvidence(
  spec: WatchSpec,
  evidence: EvidenceRecord[],
): DecideResult {
  if (evidence.length === 0) {
    return {
      should_notify: false,
      top_verdict: "NOT_TRIGGERED",
      top_confidence: 0,
      evidence,
      needs_corroboration: false,
      reasoning: "No candidates survived filtering.",
    };
  }

  const triggered = evidence.filter((e) => e.detection.verdict === "TRIGGERED");
  const best = [...evidence].sort(
    (a, b) => b.detection.confidence - a.detection.confidence,
  )[0];

  const authoritativeTriggers = triggered.filter((e) =>
    isAuthoritative(e.candidate.domain, spec),
  );
  const highConfidenceAuth = authoritativeTriggers.find(
    (e) => e.detection.confidence >= TRIGGER_CONFIDENCE_THRESHOLD,
  );

  if (highConfidenceAuth) {
    return {
      should_notify: true,
      top_verdict: "TRIGGERED",
      top_confidence: highConfidenceAuth.detection.confidence,
      evidence,
      needs_corroboration: false,
      reasoning: `Authoritative source ${highConfidenceAuth.candidate.domain} triggered with confidence ${highConfidenceAuth.detection.confidence}.`,
    };
  }

  const independentDomains = new Set(triggered.map((e) => e.candidate.domain));
  if (triggered.length >= 2 && independentDomains.size >= 2) {
    const top = triggered.sort(
      (a, b) => b.detection.confidence - a.detection.confidence,
    )[0];
    return {
      should_notify: true,
      top_verdict: "TRIGGERED",
      top_confidence: top.detection.confidence,
      evidence,
      needs_corroboration: false,
      reasoning: "Corroborated by multiple independent triggered sources.",
    };
  }

  if (triggered.length === 1) {
    return {
      should_notify: false,
      top_verdict: "TRIGGERED",
      top_confidence: triggered[0].detection.confidence,
      evidence,
      needs_corroboration: true,
      reasoning:
        "Single non-authoritative trigger; would schedule corroboration in production.",
    };
  }

  return {
    should_notify: false,
    top_verdict: best.detection.verdict,
    top_confidence: best.detection.confidence,
    evidence,
    needs_corroboration: false,
    reasoning:
      best.detection.verdict === "AMBIGUOUS"
        ? "Best verdict ambiguous; no notification."
        : "No triggered evidence.",
  };
}
