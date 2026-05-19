import type { ImpactInsight, ImpactPhrase, PromptImpactResult, Severity } from "../types";

const SEVERITY_BASE: Record<Severity, number> = {
  none: 0,
  low: 22,
  medium: 55,
  high: 82
};

interface ScoreEvidence {
  severity: Severity;
  confidence: number;
  weight: number;
}

/** Calculates a bounded 0-100 score from severity and supporting evidence. */
export function calculateImpactScore(result: PromptImpactResult): number {
  const evidence = [
    ...result.changedPhrases.map((phrase) => phraseEvidence(phrase, 0.8)),
    ...result.affectedPhrases.map((phrase) => phraseEvidence(phrase, 1)),
    ...result.insights.map(insightEvidence)
  ];
  const base = SEVERITY_BASE[result.overallSeverity];
  const evidenceScore = weightedEvidenceScore(evidence);
  const breadthBonus = Math.min(
    12,
    result.affectedPhrases.length * 3 + result.insights.length * 2 + result.recommendedChecks.length
  );
  const score = Math.max(base, evidenceScore) + breadthBonus;

  return Math.round(Math.max(0, Math.min(100, score)));
}

/** Converts an impact phrase into weighted score evidence. */
function phraseEvidence(phrase: ImpactPhrase, weight: number): ScoreEvidence {
  return {
    severity: phrase.severity,
    confidence: phrase.confidence,
    weight
  };
}

/** Converts an insight into weighted score evidence. */
function insightEvidence(insight: ImpactInsight): ScoreEvidence {
  return {
    severity: insight.severity,
    confidence: insight.confidence,
    weight: 1.25
  };
}

/** Computes the confidence-weighted score contribution from all evidence. */
function weightedEvidenceScore(evidence: ScoreEvidence[]): number {
  if (evidence.length === 0) {
    return 0;
  }

  const totals = evidence.reduce(
    (current, item) => {
      const confidence = clampConfidence(item.confidence);
      const weight = item.weight * (0.35 + confidence * 0.65);
      return {
        score: current.score + SEVERITY_BASE[item.severity] * weight,
        weight: current.weight + weight
      };
    },
    { score: 0, weight: 0 }
  );

  return totals.weight > 0 ? totals.score / totals.weight : 0;
}

/** Normalizes confidence into the 0-1 range with a neutral NaN fallback. */
function clampConfidence(confidence: number): number {
  if (Number.isNaN(confidence)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, confidence));
}
