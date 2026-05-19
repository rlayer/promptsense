import type {
  ModelListRequest,
  ModelOption,
  PromptImpactRequest,
  ProviderAdapter
} from "../../types";
import { type AnalysisMode, runProviderAnalysis } from "../analysisFlow";
import { ProviderError } from "../errors";
import {
  analysisTemperature,
  analysisTokenLimit,
  createAnalysisMessages,
  isRecord,
  readJson,
  readProviderError,
  requireApiKey,
  uniqueModelOptions
} from "../http";

const ANTHROPIC_MODELS: ModelOption[] = [
  // Fallback models in case API request fails or returns no valid models 
  {
    id: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    description: "Most capable Claude model"
  }
];

export const anthropicProvider: ProviderAdapter = {
  id: "anthropic",
  label: "Anthropic",
  requiresApiKey: true,
  fallbackModels: ANTHROPIC_MODELS,
  listModels: (input) => requestAnthropicModels(input),
  analyzePromptChange: (input) =>
    runProviderAnalysis({
      input,
      requestAnalysis: (mode) => requestAnthropicAnalysis(input, mode)
    })
};

/** Requests the account-visible Anthropic model list. */
async function requestAnthropicModels(input: ModelListRequest = {}): Promise<ModelOption[]> {
  const apiKey = requireApiKey("Anthropic", input.apiKey);
  const response = await fetch("https://api.anthropic.com/v1/models?limit=1000", {
    method: "GET",
    signal: input.signal,
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    }
  });

  const data = await readJson(response);
  if (!response.ok) {
    throw new ProviderError(
      readProviderError(data, "Anthropic model list failed."),
      response.status,
      data
    );
  }

  return extractAnthropicModels(data);
}

/** Sends one prompt-impact analysis request to the Anthropic Messages API. */
async function requestAnthropicAnalysis(
  input: PromptImpactRequest,
  mode: AnalysisMode
): Promise<string> {
  const apiKey = requireApiKey("Anthropic", input.apiKey);
  const messages = createAnalysisMessages(input, mode);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: input.signal,
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: analysisTokenLimit(mode),
      temperature: analysisTemperature(mode, input.temperature),
      system: messages.system,
      messages: [
        {
          role: "user",
          content: messages.user
        }
      ]
    })
  });

  const data = await readJson(response);
  if (!response.ok) {
    throw new ProviderError(
      readProviderError(data, "Anthropic request failed."),
      response.status,
      data
    );
  }

  const text = extractAnthropicText(data);
  if (!text) {
    throw new ProviderError("Anthropic response did not include text output.", response.status, data);
  }
  return text;
}

/** Extracts Anthropic model options from the model-list response. */
export function extractAnthropicModels(data: unknown): ModelOption[] {
  if (!isRecord(data) || !Array.isArray(data.data)) {
    return [];
  }

  return uniqueModelOptions(
    data.data.flatMap((item): ModelOption[] => {
      if (!isRecord(item) || typeof item.id !== "string") {
        return [];
      }
      return [
        {
          id: item.id,
          label: typeof item.display_name === "string" ? item.display_name : item.id,
          description: typeof item.created_at === "string" ? item.created_at : undefined
        }
      ];
    })
  );
}

/** Extracts text blocks from an Anthropic message response. */
export function extractAnthropicText(data: unknown): string {
  if (!isRecord(data) || !Array.isArray(data.content)) {
    return "";
  }

  return data.content
    .flatMap((item) => {
      if (!isRecord(item)) {
        return [];
      }
      return item.type === "text" && typeof item.text === "string" ? [item.text] : [];
    })
    .join("\n");
}
