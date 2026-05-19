import { describe, expect, it } from "vitest";
import { runProviderAnalysis, type AnalysisMode } from "./analysisFlow";

const VALID_JSON = JSON.stringify({
  summary: "The edit changes the prompt target.",
  overallSeverity: "medium",
  changedPhrases: [],
  affectedPhrases: [],
  insights: [],
  recommendedChecks: []
});

describe("runProviderAnalysis", () => {
  it("returns structured JSON on the first provider response", async () => {
    const modes: AnalysisMode[] = [];

    const result = await runProviderAnalysis({
      input: requestInput(),
      requestAnalysis: async (mode) => {
        modes.push(mode);
        return VALID_JSON;
      }
    });

    expect(modes).toEqual(["json"]);
    expect(result.summary).toBe("The edit changes the prompt target.");
  });

  it("retries structured JSON before falling back to plain text", async () => {
    const modes: AnalysisMode[] = [];

    const result = await runProviderAnalysis({
      input: requestInput(),
      requestAnalysis: async (mode) => {
        modes.push(mode);
        if (mode === "plain") {
          return "Summary\nThe edit makes the prompt ambiguous.";
        }
        return `{"summary":"cut`;
      }
    });

    expect(modes).toEqual(["json", "json-retry", "plain"]);
    expect(result.summary).toContain("The edit makes the prompt ambiguous.");
    expect(result.changedPhrases[0].text).toBe("Alexander");
  });
});

/** Builds a reusable provider-analysis request fixture. */
function requestInput() {
  return {
    baselinePrompt: "When was Alexander the Great born?",
    currentPrompt: "When was Alexander born?",
    changedExcerpts: [
      {
        id: "change-1",
        kind: "changed" as const,
        before: "Alexander the Great",
        after: "Alexander",
        start: 9,
        end: 18
      }
    ],
    model: "test-model",
    temperature: 0.2
  };
}
