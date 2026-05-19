import {
  PromptImpactParseError,
  createPlainTextImpactResult,
  parsePromptImpactJson
} from "../analysis/promptContract";
import type { PromptImpactRequest, PromptImpactResult } from "../types";

export type AnalysisMode = "json" | "json-retry" | "plain";

interface RunProviderAnalysisOptions {
  input: PromptImpactRequest;
  requestAnalysis(mode: AnalysisMode): Promise<string>;
}

/**
 * Keeps provider adapters focused on wire format.
 *
 * The app prefers structured JSON so it can map phrase-level highlights. Some
 * browser/provider combinations occasionally return malformed JSON, so every
 * provider gets the same recovery ladder:
 * 1. normal structured JSON,
 * 2. stricter structured JSON retry,
 * 3. full plain-text analysis that can still be displayed to the user.
 */
export async function runProviderAnalysis({
  input,
  requestAnalysis
}: RunProviderAnalysisOptions): Promise<PromptImpactResult> {
  for (const mode of ["json", "json-retry"] as const) {
    const text = await requestAnalysis(mode);
    try {
      return parsePromptImpactJson(text);
    } catch (error) {
      if (!shouldRetryStructuredOutput(error, input)) {
        throw error;
      }
    }
  }

  return createPlainTextImpactResult(await requestAnalysis("plain"), input);
}

/** Allows structured-output retry only for parse errors on active requests. */
function shouldRetryStructuredOutput(error: unknown, input: PromptImpactRequest): boolean {
  return error instanceof PromptImpactParseError && !input.signal?.aborted;
}
