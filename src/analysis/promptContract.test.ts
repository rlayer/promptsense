import { describe, expect, it } from "vitest";
import {
  PromptImpactParseError,
  createAnalysisPrompt,
  createPlainAnalysisPrompt,
  createPlainTextImpactResult,
  parsePromptImpactJson
} from "./promptContract";

describe("createAnalysisPrompt", () => {
  it("asks for affected prompt parts outside the edited text", () => {
    const messages = createAnalysisPrompt({
      baselinePrompt: "Return JSON.",
      currentPrompt: "Return JSON with severity.",
      changedExcerpts: [],
      model: "demo",
      temperature: 0.2
    });

    expect(messages.system).toContain("outside the edited text");
    expect(messages.system).toContain("at most 3 changed phrases");
    expect(messages.user).toContain("valid JSON object only");
  });

  it("does not send the full checkpoint prompt in live mode", () => {
    const checkpoint = "UNIQUE_BASELINE_TEXT ".repeat(30);
    const messages = createAnalysisPrompt({
      baselinePrompt: checkpoint,
      currentPrompt: "Return JSON with severity.",
      changedExcerpts: [
        {
          id: "change-1",
          kind: "changed",
          before: "priority",
          after: "severity",
          start: 17,
          end: 25
        }
      ],
      model: "demo",
      temperature: 0.2
    });

    expect(messages.user).not.toContain(checkpoint);
    expect(messages.user).toContain("priority");
    expect(messages.user).toContain("severity");
  });

  it("can request plain text analysis for fallback display", () => {
    const messages = createPlainAnalysisPrompt({
      baselinePrompt: "When was Alexander the Great born?",
      currentPrompt: "When was Alexander born?",
      changedExcerpts: [],
      model: "demo",
      temperature: 0.2
    });

    expect(messages.system).toContain("Return plain text only");
    expect(messages.user).toContain("Do not return JSON");
  });
});

describe("createPlainTextImpactResult", () => {
  it("keeps the full plain text analysis visible", () => {
    const result = createPlainTextImpactResult(
      "Summary\nThe edit makes Alexander ambiguous.\n\nChecks\nVerify whether the prompt means Alexander the Great."
    );

    expect(result.summary).toContain("The edit makes Alexander ambiguous.");
    expect(result.overallSeverity).toBe("medium");
    expect(result.changedPhrases).toEqual([]);
    expect(result.affectedPhrases).toEqual([]);
  });

  it("derives fallback highlights and insight cards from the local diff", () => {
    const result = createPlainTextImpactResult(
      [
        "Summary",
        "The edit removes a required output key.",
        "",
        "Side effects",
        "1. **Schema mismatch:** The example may no longer match the output instructions.",
        "",
        "Checks",
        "1. Run parser snapshots."
      ].join("\n"),
      {
        currentPrompt: `# Output Format
Return JSON with these keys:
- summary
- category

# Examples
Customer: I can log in.`,
        changedExcerpts: [
          {
            id: "change-1",
            kind: "removed",
            before: "- priority",
            after: "",
            start: "# Output Format\nReturn JSON with these keys:\n- summary\n- category\n".length,
            end: "# Output Format\nReturn JSON with these keys:\n- summary\n- category\n".length
          },
          {
            id: "change-2",
            kind: "changed",
            before: "Customer: I cannot log in.",
            after: "Customer: I can log in.",
            start: "# Output Format\nReturn JSON with these keys:\n- summary\n- category\n\n# Examples\n".length,
            end:
              "# Output Format\nReturn JSON with these keys:\n- summary\n- category\n\n# Examples\n"
                .length + "Customer: I can log in.".length
          }
        ]
      }
    );

    expect(result.changedPhrases[0].text).toBe("Customer: I can log in.");
    expect(result.affectedPhrases[0]).toMatchObject({
      text: "# Output Format",
      category: "direct"
    });
    expect(result.insights[0]).toMatchObject({
      affectedPhrase: "# Output Format",
      expectedSideEffect: "Schema mismatch: The example may no longer match the output instructions.",
      suggestedValidation: "Run parser snapshots."
    });
  });
});

describe("parsePromptImpactJson", () => {
  it("normalizes model output from fenced JSON", () => {
    const result = parsePromptImpactJson(`\`\`\`json
{
  "summary": "Schema changed",
  "overallSeverity": "high",
  "changedPhrases": [{"text": "severity", "category": "changed", "severity": "high", "confidence": 1}],
  "affectedPhrases": [{"text": "Examples", "category": "indirect", "severity": "medium", "confidence": 0.7}],
  "insights": [{"affectedPhrase": "Examples", "sourceChange": "severity", "expectedSideEffect": "Examples stale"}],
  "recommendedChecks": ["Run parser tests"]
}
\`\`\``);

    expect(result.overallSeverity).toBe("high");
    expect(result.changedPhrases[0].text).toBe("severity");
    expect(result.insights[0]).toMatchObject({
      id: "insight-1",
      confidence: 0.5,
      suggestedValidation: "Review this prompt behavior."
    });
  });

  it("extracts JSON when the model adds surrounding text", () => {
    const result = parsePromptImpactJson(`Here you go:
{"summary":"ok","overallSeverity":"low","changedPhrases":[],"affectedPhrases":[],"insights":[],"recommendedChecks":[]}
Thanks.`);

    expect(result.summary).toBe("ok");
    expect(result.overallSeverity).toBe("low");
  });

  it("repairs unescaped newlines and trailing commas", () => {
    const result = parsePromptImpactJson(`{
      "summary": "Line one
Line two",
      "overallSeverity": "low",
      "changedPhrases": [],
      "affectedPhrases": [],
      "insights": [],
      "recommendedChecks": [],
    }`);

    expect(result.summary).toBe("Line one\nLine two");
  });

  it("repairs unescaped quotes inside model strings", () => {
    const result = parsePromptImpactJson(`{
      "summary": "The prompt asks "When Alexander was born?" and changes the task.",
      "overallSeverity": "low",
      "changedPhrases": [],
      "affectedPhrases": [],
      "insights": [],
      "recommendedChecks": []
    }`);

    expect(result.summary).toContain("When Alexander was born?");
  });

  it("rejects incomplete recovered JSON instead of showing partial analysis", () => {
    expect(() =>
      parsePromptImpactJson(`{"summary":"The removal of the title makes the question ambiguous. This`)
    ).toThrow(PromptImpactParseError);
  });

  it("uses recovered insight text instead of a generic fallback", () => {
    const result = parsePromptImpactJson(`{
      "summary":"The removal makes the question ambiguous. This",
      "overallSeverity":"medium",
      "changedPhrases":[],
      "affectedPhrases":[],
      "insights":[{"expectedSideEffect":"The edit can make the question refer to several historical figures.","affectedPhrase":"Alexander","sourceChange":"the Great"}],
      "recommendedChecks":[]
    `);

    expect(result.summary).toBe(
      "The edit can make the question refer to several historical figures."
    );
  });

  it("rejects simple truncated JSON strings", () => {
    expect(() => parsePromptImpactJson(`{"summary":"unterminated`)).toThrow(
      PromptImpactParseError
    );
  });

  it("throws a friendly error when JSON cannot be recovered", () => {
    expect(() => parsePromptImpactJson(`not json at all`)).toThrow(PromptImpactParseError);
    expect(() => parsePromptImpactJson(`not json at all`)).toThrow(
      "model returned malformed JSON"
    );
  });
});
