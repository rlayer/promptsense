import { describe, expect, it } from "vitest";
import { calculateImpactScore } from "./impactScore";
import type { PromptImpactResult } from "../types";

describe("calculateImpactScore", () => {
  it("returns 0 for a no-impact result", () => {
    expect(calculateImpactScore(resultWithSeverity("none"))).toBe(0);
  });

  it("scores higher severity as greater impact", () => {
    const low = calculateImpactScore(resultWithSeverity("low"));
    const medium = calculateImpactScore(resultWithSeverity("medium"));
    const high = calculateImpactScore(resultWithSeverity("high"));

    expect(low).toBeGreaterThan(0);
    expect(medium).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(medium);
  });

  it("adds breadth without exceeding 100", () => {
    const score = calculateImpactScore({
      summary: "Wide high-risk change.",
      overallSeverity: "high",
      changedPhrases: [
        { text: "schema", category: "changed", severity: "high", confidence: 1 }
      ],
      affectedPhrases: [
        { text: "Example", category: "indirect", severity: "high", confidence: 1 },
        { text: "Parser", category: "indirect", severity: "high", confidence: 1 }
      ],
      insights: [
        {
          id: "one",
          severity: "high",
          affectedPhrase: "Parser",
          sourceChange: "schema",
          expectedSideEffect: "Parser may break.",
          confidence: 1,
          suggestedValidation: "Run parser checks."
        }
      ],
      recommendedChecks: ["Run parser checks.", "Run examples."]
    });

    expect(score).toBeGreaterThan(90);
    expect(score).toBeLessThanOrEqual(100);
  });
});

/** Builds a minimal result fixture for a single severity level. */
function resultWithSeverity(
  overallSeverity: PromptImpactResult["overallSeverity"]
): PromptImpactResult {
  return {
    summary: "Impact summary.",
    overallSeverity,
    changedPhrases: [],
    affectedPhrases: [],
    insights: [],
    recommendedChecks: []
  };
}
