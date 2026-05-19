import { describe, expect, it } from "vitest";
import { buildHighlightSegments, mapImpactToSpans } from "./spans";
import type { PromptImpactResult } from "../types";

describe("mapImpactToSpans", () => {
  it("maps exact phrase matches", () => {
    const prompt = "Return JSON with severity.\nExamples must match.";
    const result: PromptImpactResult = {
      summary: "Schema changed.",
      overallSeverity: "high",
      changedPhrases: [
        {
          text: "severity",
          category: "changed",
          severity: "high",
          confidence: 0.9
        }
      ],
      affectedPhrases: [
        {
          text: "Examples must match.",
          category: "indirect",
          severity: "medium",
          confidence: 0.7
        }
      ],
      insights: [],
      recommendedChecks: []
    };

    const spans = mapImpactToSpans(prompt, result);

    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({ text: "severity", fuzzy: false });
    expect(spans[1]).toMatchObject({ text: "Examples must match.", fuzzy: false });
  });

  it("uses fuzzy matches with reduced confidence", () => {
    const prompt = "Downstream systems parse JSON keys exactly.";
    const result: PromptImpactResult = {
      summary: "Parser affected.",
      overallSeverity: "high",
      changedPhrases: [],
      affectedPhrases: [
        {
          text: "Downstream parser expects exact JSON keys",
          category: "indirect",
          severity: "high",
          confidence: 0.95
        }
      ],
      insights: [],
      recommendedChecks: []
    };

    const [span] = mapImpactToSpans(prompt, result);

    expect(span.fuzzy).toBe(true);
    expect(span.confidence).toBeLessThanOrEqual(0.6);
    expect(span.text).toBe(prompt);
  });
});

describe("buildHighlightSegments", () => {
  it("uses the highest-priority span for overlapping characters", () => {
    const segments = buildHighlightSegments("abcdef", [
      {
        id: "low",
        start: 1,
        end: 5,
        text: "bcde",
        category: "indirect",
        severity: "low",
        confidence: 0.5,
        fuzzy: false
      },
      {
        id: "high",
        start: 2,
        end: 4,
        text: "cd",
        category: "changed",
        severity: "high",
        confidence: 0.8,
        fuzzy: false
      }
    ]);

    expect(segments.map((segment) => [segment.text, segment.span?.id])).toEqual([
      ["a", undefined],
      ["b", "low"],
      ["cd", "high"],
      ["e", "low"],
      ["f", undefined]
    ]);
  });
});

