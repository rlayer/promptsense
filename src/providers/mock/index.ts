import type {
  ImpactInsight,
  ImpactPhrase,
  ModelOption,
  PromptImpactRequest,
  PromptImpactResult,
  ProviderAdapter,
  Severity
} from "../../types";

const MOCK_MODELS: ModelOption[] = [
  {
    id: "demo-impact-model",
    label: "Demo impact model",
    description: "Deterministic local analysis"
  }
];

const OUTPUT_TERMS = ["json", "schema", "format", "keys", "output", "response"];
const SAFETY_TERMS = ["never", "secret", "privacy", "refuse", "unsafe", "pii", "jailbreak"];
const TOOL_TERMS = ["tool", "function", "api", "argument", "call"];
const TONE_TERMS = ["tone", "friendly", "formal", "concise", "warm", "brief"];

export const mockProvider: ProviderAdapter = {
  id: "mock",
  label: "Demo",
  requiresApiKey: false,
  fallbackModels: MOCK_MODELS,
  listModels: async () => MOCK_MODELS,
  analyzePromptChange: async (input) => mockAnalyze(input)
};

/** Produces deterministic local analysis for demo mode. */
export async function mockAnalyze(input: PromptImpactRequest): Promise<PromptImpactResult> {
  await waitForAbortableDelay(120, input.signal);

  const changedText = input.changedExcerpts.map((excerpt) => excerpt.after).join("\n");
  const contextText = input.changedExcerpts
    .map((excerpt) => excerptContext(input.currentPrompt, excerpt.start, excerpt.end))
    .join("\n");
  const changedPhrase = compactPhrase(changedText) || compactPhrase(contextText);
  const lowerChanged = `${changedText}\n${contextText}`.toLocaleLowerCase();
  const severity = inferSeverity(lowerChanged);
  const affectedPhrases = findAffectedPhrases(input.currentPrompt, lowerChanged, changedPhrase);
  const insights = affectedPhrases.map((phrase, index): ImpactInsight => {
    const expectedSideEffect =
      phrase.category === "direct"
        ? "The edited instruction can change required output behavior."
        : phrase.category === "indirect"
          ? "This phrase may need to stay consistent with the edited instruction."
          : "No meaningful behavioral coupling detected.";

    return {
      id: `demo-${index + 1}`,
      severity: phrase.severity,
      affectedPhrase: phrase.text,
      sourceChange: changedPhrase,
      expectedSideEffect,
      confidence: phrase.confidence,
      suggestedValidation: suggestedValidation(lowerChanged)
    };
  });

  return {
    summary:
      severity === "high"
        ? "The edit changes a contract-like part of the prompt and may affect examples or downstream behavior."
        : severity === "medium"
          ? "The edit has localized impact with some likely coupling."
          : "The edit appears localized with limited side effects.",
    overallSeverity: severity,
    changedPhrases: [
      {
        text: changedPhrase,
        category: "changed",
        severity,
        confidence: 0.84,
        reason: "Detected as the edited prompt phrase."
      }
    ],
    affectedPhrases,
    insights,
    recommendedChecks: buildRecommendedChecks(lowerChanged)
  };
}

/** Finds demo affected phrases based on keyword categories in the edit. */
function findAffectedPhrases(
  prompt: string,
  lowerChanged: string,
  sourceChange: string
): ImpactPhrase[] {
  const candidates: ImpactPhrase[] = [];

  if (containsAny(lowerChanged, OUTPUT_TERMS)) {
    addIfFound(candidates, prompt, ["# Examples", "Assistant:", "Return JSON"], {
      category: "indirect",
      severity: "high",
      confidence: 0.78,
      sourceChange,
      reason: "Examples and parser-facing instructions may no longer match the output contract."
    });
  }

  if (containsAny(lowerChanged, SAFETY_TERMS)) {
    addIfFound(candidates, prompt, ["Never", "refuse", "Safety", "private"], {
      category: "indirect",
      severity: "high",
      confidence: 0.74,
      sourceChange,
      reason: "Safety boundary changes can affect refusal examples and sensitive-data handling."
    });
  }

  if (containsAny(lowerChanged, TOOL_TERMS)) {
    addIfFound(candidates, prompt, ["tool", "function", "arguments", "API"], {
      category: "direct",
      severity: "medium",
      confidence: 0.7,
      sourceChange,
      reason: "Tool-use wording can change call selection or argument shape."
    });
  }

  if (containsAny(lowerChanged, TONE_TERMS)) {
    addIfFound(candidates, prompt, ["Tone", "concise", "friendly", "formal"], {
      category: "direct",
      severity: "low",
      confidence: 0.72,
      sourceChange,
      reason: "Tone edits usually affect response style without changing task logic."
    });
  }

  if (candidates.length === 0) {
    const firstStableLine = prompt
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !sourceChange.includes(line));
    if (firstStableLine) {
      candidates.push({
        text: firstStableLine,
        category: "no-impact",
        severity: "none",
        confidence: 0.58,
        sourceChange,
        reason: "No strong coupling signal found in demo analysis."
      });
    }
  }

  return candidates;
}

/** Adds the first prompt line matching any search term to the candidate list. */
function addIfFound(
  candidates: ImpactPhrase[],
  prompt: string,
  searchTerms: string[],
  defaults: Omit<ImpactPhrase, "text">
) {
  const lowerPrompt = prompt.toLocaleLowerCase();
  const found = searchTerms.find((term) => lowerPrompt.includes(term.toLocaleLowerCase()));
  if (!found) {
    return;
  }
  const line =
    prompt
      .split("\n")
      .map((item) => item.trim())
      .find((item) => item.toLocaleLowerCase().includes(found.toLocaleLowerCase())) ?? found;
  candidates.push({ text: line, ...defaults });
}

/** Infers demo severity from keyword categories in changed text. */
function inferSeverity(changedText: string): Severity {
  if (containsAny(changedText, OUTPUT_TERMS) || containsAny(changedText, SAFETY_TERMS)) {
    return "high";
  }
  if (containsAny(changedText, TOOL_TERMS)) {
    return "medium";
  }
  if (containsAny(changedText, TONE_TERMS)) {
    return "low";
  }
  return "low";
}

/** Builds deterministic recommended checks for demo analysis. */
function buildRecommendedChecks(changedText: string): string[] {
  const checks = ["Review impacted phrases before accepting the checkpoint."];
  if (containsAny(changedText, OUTPUT_TERMS)) {
    checks.push("Run output schema snapshots and parser checks.");
  }
  if (containsAny(changedText, SAFETY_TERMS)) {
    checks.push("Run refusal and sensitive-data regression prompts.");
  }
  if (containsAny(changedText, TOOL_TERMS)) {
    checks.push("Replay tool-call traces and validate arguments.");
  }
  if (containsAny(changedText, TONE_TERMS)) {
    checks.push("Compare style snapshots for representative prompts.");
  }
  return checks;
}

/** Chooses one validation suggestion based on the dominant edit category. */
function suggestedValidation(changedText: string): string {
  if (containsAny(changedText, OUTPUT_TERMS)) {
    return "Validate JSON shape, examples, and downstream parser assumptions.";
  }
  if (containsAny(changedText, SAFETY_TERMS)) {
    return "Run refusal and privacy regression cases.";
  }
  if (containsAny(changedText, TOOL_TERMS)) {
    return "Replay tool-call examples.";
  }
  return "Run the smallest eval set tagged to this prompt section.";
}

/** Checks whether text includes any keyword in a category. */
function containsAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

/** Chooses a short representative changed phrase from multi-line text. */
function compactPhrase(text: string): string {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const candidate = lines.find((line) => line.length >= 8) ?? lines[0] ?? "";
  return candidate.length > 180 ? `${candidate.slice(0, 177)}...` : candidate;
}

/** Reads nearby prompt context around a changed excerpt. */
function excerptContext(prompt: string, start: number, end: number): string {
  const contextStart = Math.max(0, start - 160);
  const contextEnd = Math.min(prompt.length, end + 160);
  return prompt.slice(contextStart, contextEnd);
}

/** Simulates provider latency while respecting abort signals. */
function waitForAbortableDelay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Request aborted", "AbortError"));
      return;
    }
    const timeout = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Request aborted", "AbortError"));
      },
      { once: true }
    );
  });
}
