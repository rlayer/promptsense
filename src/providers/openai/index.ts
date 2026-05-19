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
  formatModelLabel,
  isRecord,
  readJson,
  readProviderError,
  requireApiKey,
  uniqueModelOptions
} from "../http";

const OPENAI_MODELS: ModelOption[] = [
  // Fallback models in case API request fails or returns no valid models 
  {
    id: "gpt-5-mini",
    label: "GPT-5 mini",
    description: "Lower latency and cost"
  }
];

export const openAIProvider: ProviderAdapter = {
  id: "openai",
  label: "OpenAI",
  requiresApiKey: true,
  fallbackModels: OPENAI_MODELS,
  listModels: (input) => requestOpenAIModels(input),
  analyzePromptChange: (input) =>
    runProviderAnalysis({
      input,
      requestAnalysis: (mode) => requestOpenAIAnalysis(input, mode)
    })
};

/** Requests the account-visible OpenAI model list. */
async function requestOpenAIModels(input: ModelListRequest = {}): Promise<ModelOption[]> {
  const apiKey = requireApiKey("OpenAI", input.apiKey);
  const response = await fetch("https://api.openai.com/v1/models", {
    method: "GET",
    signal: input.signal,
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  const data = await readJson(response);
  if (!response.ok) {
    throw new ProviderError(
      readProviderError(data, "OpenAI model list failed."),
      response.status,
      data
    );
  }

  return extractOpenAIModels(data);
}

/** Sends one prompt-impact analysis request to the OpenAI Responses API. */
async function requestOpenAIAnalysis(input: PromptImpactRequest, mode: AnalysisMode): Promise<string> {
  const apiKey = requireApiKey("OpenAI", input.apiKey);
  const messages = createAnalysisMessages(input, mode);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: input.signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: input.model,
      temperature: analysisTemperature(mode, input.temperature),
      max_output_tokens: analysisTokenLimit(mode),
      input: [
        {
          role: "system",
          content: messages.system
        },
        {
          role: "user",
          content: messages.user
        }
      ]
    })
  });

  const data = await readJson(response);
  if (!response.ok) {
    throw new ProviderError(readProviderError(data, "OpenAI request failed."), response.status, data);
  }

  const text = extractOpenAIText(data);
  if (!text) {
    throw new ProviderError("OpenAI response did not include text output.", response.status, data);
  }
  return text;
}

/** Extracts text-capable OpenAI model options from the model-list response. */
export function extractOpenAIModels(data: unknown): ModelOption[] {
  if (!isRecord(data) || !Array.isArray(data.data)) {
    return [];
  }

  return uniqueModelOptions(
    data.data.flatMap((item): ModelOption[] => {
      if (!isRecord(item) || typeof item.id !== "string" || !isOpenAITextModel(item.id)) {
        return [];
      }
      return [
        {
          id: item.id,
          label: formatModelLabel(item.id),
          description: typeof item.owned_by === "string" ? item.owned_by : undefined
        }
      ];
    })
  );
}

/** Extracts generated text from supported OpenAI response shapes. */
export function extractOpenAIText(data: unknown): string {
  if (!isRecord(data)) {
    return "";
  }

  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  const output = Array.isArray(data.output) ? data.output : [];
  return output
    .flatMap((item) => {
      if (!isRecord(item) || !Array.isArray(item.content)) {
        return [];
      }
      return item.content.flatMap((contentItem) => {
        if (!isRecord(contentItem)) {
          return [];
        }
        if (typeof contentItem.text === "string") {
          return [contentItem.text];
        }
        if (typeof contentItem.output_text === "string") {
          return [contentItem.output_text];
        }
        return [];
      });
    })
    .join("\n");
}

/** Filters OpenAI model ids down to text/chat/reasoning-capable families. */
function isOpenAITextModel(id: string): boolean {
  const lowerId = id.toLowerCase();
  if (
    /(audio|dall-e|embedding|image|moderation|realtime|tts|transcribe|whisper)/.test(lowerId)
  ) {
    return false;
  }
  return /^(gpt-|o\d|o\d-|chatgpt-|codex-)/.test(lowerId);
}
