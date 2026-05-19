import {
  createAnalysisPrompt,
  createPlainAnalysisPrompt,
  type AnalysisPromptMessages
} from "../analysis/promptContract";
import type { ModelOption, PromptImpactRequest } from "../types";
import type { AnalysisMode } from "./analysisFlow";
import { ProviderError } from "./errors";

/** Selects the provider prompt contract for the requested analysis mode. */
export function createAnalysisMessages(
  input: PromptImpactRequest,
  mode: AnalysisMode
): AnalysisPromptMessages {
  return mode === "plain"
    ? createPlainAnalysisPrompt(input)
    : createAnalysisPrompt(input, { retry: mode === "json-retry" });
}

/** Returns deterministic temperature for retries and plain fallback. */
export function analysisTemperature(mode: AnalysisMode, requestedTemperature: number): number {
  return mode === "json" ? requestedTemperature : 0;
}

/** Chooses a response token budget for each analysis mode. */
export function analysisTokenLimit(mode: AnalysisMode): number {
  if (mode === "plain") {
    return 2600;
  }
  return mode === "json-retry" ? 2200 : 1200;
}

/** Reads response JSON without throwing when the body is malformed. */
export async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => undefined);
}

/** Validates that a live provider request has an API key. */
export function requireApiKey(provider: string, apiKey: string | undefined): string {
  if (!apiKey?.trim()) {
    throw new ProviderError(`${provider} API key is required.`);
  }
  return apiKey;
}

/** Extracts a provider error message from a JSON error payload. */
export function readProviderError(data: unknown, fallback: string): string {
  if (isRecord(data) && isRecord(data.error) && typeof data.error.message === "string") {
    return data.error.message;
  }
  return fallback;
}

/** Converts a provider model id into readable option text. */
export function formatModelLabel(id: string): string {
  return id
    .replace(/^models\//, "")
    .split("-")
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "gpt") {
        return "GPT";
      }
      if (lower === "api") {
        return "API";
      }
      return part ? part[0].toUpperCase() + part.slice(1) : part;
    })
    .join(" ");
}

/** Removes duplicate model options while preserving first-seen order. */
export function uniqueModelOptions(options: ModelOption[]): ModelOption[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.id)) {
      return false;
    }
    seen.add(option.id);
    return true;
  });
}

/** Narrows an unknown value to an object record. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
