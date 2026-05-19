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

const GEMINI_MODELS: ModelOption[] = [
  // Fallback models in case API request fails or returns no valid models 
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    description: "Balanced latency and quality"
  }
];

export const geminiProvider: ProviderAdapter = {
  id: "gemini",
  label: "Google Gemini",
  requiresApiKey: true,
  fallbackModels: GEMINI_MODELS,
  listModels: (input) => requestGeminiModels(input),
  analyzePromptChange: (input) =>
    runProviderAnalysis({
      input,
      requestAnalysis: (mode) => requestGeminiAnalysis(input, mode)
    })
};

/** Requests the account-visible Gemini model list. */
async function requestGeminiModels(input: ModelListRequest = {}): Promise<ModelOption[]> {
  const apiKey = requireApiKey("Google Gemini", input.apiKey);
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
    {
      method: "GET",
      signal: input.signal,
      headers: {
        "x-goog-api-key": apiKey
      }
    }
  );

  const data = await readJson(response);
  if (!response.ok) {
    throw new ProviderError(
      readProviderError(data, "Gemini model list failed."),
      response.status,
      data
    );
  }

  return extractGeminiModels(data);
}

/** Sends one prompt-impact analysis request to Gemini Generate Content. */
async function requestGeminiAnalysis(input: PromptImpactRequest, mode: AnalysisMode): Promise<string> {
  const apiKey = requireApiKey("Google Gemini", input.apiKey);
  const messages = createAnalysisMessages(input, mode);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    input.model
  )}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    signal: input.signal,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: messages.system }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: messages.user }]
        }
      ],
      generationConfig: geminiGenerationConfig(mode, input.temperature)
    })
  });

  const data = await readJson(response);
  if (!response.ok) {
    throw new ProviderError(
      readProviderError(data, "Gemini request failed."),
      response.status,
      data
    );
  }

  const text = extractGeminiText(data);
  if (!text) {
    throw new ProviderError("Gemini response did not include text output.", response.status, data);
  }
  return text;
}

/** Builds Gemini generation settings and JSON schema hints for structured modes. */
function geminiGenerationConfig(mode: AnalysisMode, temperature: number) {
  const config = {
    temperature: analysisTemperature(mode, temperature),
    maxOutputTokens: analysisTokenLimit(mode)
  };

  return mode === "plain"
    ? config
    : {
        ...config,
        responseMimeType: "application/json",
        responseSchema: geminiImpactSchema
      };
}

const geminiImpactSchema = {
  type: "OBJECT",
  required: [
    "summary",
    "overallSeverity",
    "changedPhrases",
    "affectedPhrases",
    "insights",
    "recommendedChecks"
  ],
  properties: {
    summary: { type: "STRING" },
    overallSeverity: {
      type: "STRING",
      enum: ["none", "low", "medium", "high"]
    },
    changedPhrases: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["text", "category", "severity", "confidence"],
        properties: {
          text: { type: "STRING" },
          category: { type: "STRING", enum: ["changed"] },
          severity: { type: "STRING", enum: ["none", "low", "medium", "high"] },
          confidence: { type: "NUMBER" },
          reason: { type: "STRING" },
          sourceChange: { type: "STRING" }
        }
      }
    },
    affectedPhrases: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["text", "category", "severity", "confidence"],
        properties: {
          text: { type: "STRING" },
          category: { type: "STRING", enum: ["direct", "indirect", "no-impact"] },
          severity: { type: "STRING", enum: ["none", "low", "medium", "high"] },
          confidence: { type: "NUMBER" },
          reason: { type: "STRING" },
          sourceChange: { type: "STRING" }
        }
      }
    },
    insights: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: [
          "id",
          "severity",
          "affectedPhrase",
          "sourceChange",
          "expectedSideEffect",
          "confidence",
          "suggestedValidation"
        ],
        properties: {
          id: { type: "STRING" },
          severity: { type: "STRING", enum: ["none", "low", "medium", "high"] },
          affectedPhrase: { type: "STRING" },
          sourceChange: { type: "STRING" },
          expectedSideEffect: { type: "STRING" },
          confidence: { type: "NUMBER" },
          suggestedValidation: { type: "STRING" }
        }
      }
    },
    recommendedChecks: {
      type: "ARRAY",
      items: { type: "STRING" }
    }
  },
  propertyOrdering: [
    "summary",
    "overallSeverity",
    "changedPhrases",
    "affectedPhrases",
    "insights",
    "recommendedChecks"
  ]
};

/** Extracts generateContent-capable Gemini models from the list response. */
export function extractGeminiModels(data: unknown): ModelOption[] {
  if (!isRecord(data) || !Array.isArray(data.models)) {
    return [];
  }

  return uniqueModelOptions(
    data.models.flatMap((item): ModelOption[] => {
      if (!isRecord(item) || !supportsGenerateContent(item)) {
        return [];
      }

      const id = readGeminiModelId(item);
      if (!id) {
        return [];
      }

      return [
        {
          id,
          label: typeof item.displayName === "string" ? item.displayName : formatModelLabel(id),
          description: typeof item.description === "string" ? item.description : undefined
        }
      ];
    })
  );
}

/** Extracts candidate text parts from a Gemini response. */
export function extractGeminiText(data: unknown): string {
  if (!isRecord(data) || !Array.isArray(data.candidates)) {
    return "";
  }

  return data.candidates
    .flatMap((candidate) => {
      if (!isRecord(candidate) || !isRecord(candidate.content)) {
        return [];
      }
      const parts = Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
      return parts.flatMap((part) => {
        if (!isRecord(part)) {
          return [];
        }
        return typeof part.text === "string" ? [part.text] : [];
      });
    })
    .join("\n");
}

/** Removes the API's models/ prefix from a Gemini model name. */
function readGeminiModelId(item: Record<string, unknown>): string {
  const rawName = typeof item.name === "string" ? item.name : "";
  return rawName.replace(/^models\//, "");
}

/** Checks whether a Gemini model advertises generateContent support. */
function supportsGenerateContent(item: Record<string, unknown>): boolean {
  return (
    Array.isArray(item.supportedGenerationMethods) &&
    item.supportedGenerationMethods.includes("generateContent")
  );
}
