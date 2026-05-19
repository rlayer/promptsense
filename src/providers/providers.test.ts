import { afterEach, describe, expect, it, vi } from "vitest";
import { extractAnthropicModels, extractAnthropicText } from "./anthropic";
import { extractGeminiModels, extractGeminiText, geminiProvider } from "./gemini";
import { PROVIDERS } from ".";
import { extractOpenAIModels, extractOpenAIText } from "./openai";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("provider response extraction", () => {
  it("extracts OpenAI output text", () => {
    expect(extractOpenAIText({ output_text: "{\"summary\":\"ok\"}" })).toBe("{\"summary\":\"ok\"}");
    expect(
      extractOpenAIText({
        output: [
          {
            content: [{ type: "output_text", text: "hello" }]
          }
        ]
      })
    ).toBe("hello");
  });

  it("extracts Anthropic message text", () => {
    expect(
      extractAnthropicText({
        content: [{ type: "text", text: "{\"summary\":\"ok\"}" }]
      })
    ).toBe("{\"summary\":\"ok\"}");
  });

  it("extracts Gemini generated text", () => {
    expect(
      extractGeminiText({
        candidates: [
          {
            content: {
              parts: [{ text: "{\"summary\":\"ok\"}" }]
            }
          }
        ]
      })
    ).toBe("{\"summary\":\"ok\"}");
  });
});

describe("provider model extraction", () => {
  it("extracts OpenAI text models and skips non-text models", () => {
    expect(
      extractOpenAIModels({
        data: [
          { id: "gpt-5-mini", owned_by: "openai" },
          { id: "text-embedding-3-large", owned_by: "openai" },
          { id: "gpt-4.1", owned_by: "openai" }
        ]
      }).map((model) => model.id)
    ).toEqual(["gpt-5-mini", "gpt-4.1"]);
  });

  it("extracts Anthropic models", () => {
    expect(
      extractAnthropicModels({
        data: [
          {
            id: "claude-sonnet-4-20250514",
            display_name: "Claude Sonnet 4",
            created_at: "2025-05-14T00:00:00Z"
          }
        ]
      })
    ).toEqual([
      {
        id: "claude-sonnet-4-20250514",
        label: "Claude Sonnet 4",
        description: "2025-05-14T00:00:00Z"
      }
    ]);
  });

  it("extracts Gemini generateContent models", () => {
    expect(
      extractGeminiModels({
        models: [
          {
            name: "models/gemini-2.5-flash",
            displayName: "Gemini 2.5 Flash",
            description: "Fast model",
            supportedGenerationMethods: ["generateContent"]
          },
          {
            name: "models/text-embedding-004",
            displayName: "Embedding",
            supportedGenerationMethods: ["embedContent"]
          }
        ]
      })
    ).toEqual([
      {
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        description: "Fast model"
      }
    ]);
  });
});

describe("provider registry", () => {
  it("includes Google Gemini", () => {
    expect(PROVIDERS.map((provider) => provider.id)).toContain("gemini");
  });
});

describe("Gemini fallback behavior", () => {
  it("falls back to full plain text analysis when JSON attempts fail", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(geminiResponse(`{"summary":"cut`))
      .mockResolvedValueOnce(geminiResponse(`{"summary":"still cut`))
      .mockResolvedValueOnce(
        geminiResponse(
          "Summary\nThe edit makes Alexander ambiguous.\n\nChecks\nClarify whether Alexander means Alexander the Great."
        )
      );

    const result = await geminiProvider.analyzePromptChange({
      baselinePrompt: "When was Alexander the Great born?",
      currentPrompt: "When was Alexander born?",
      changedExcerpts: [
        {
          id: "change-1",
          kind: "changed",
          before: "Alexander the Great",
          after: "Alexander",
          start: 9,
          end: 18
        }
      ],
      model: "gemini-2.5-flash",
      apiKey: "test-key",
      temperature: 0.2
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.summary).toContain("The edit makes Alexander ambiguous.");
    expect(result.changedPhrases[0].text).toBe("Alexander");
    expect(result.affectedPhrases).toEqual([]);
  });
});

/** Builds a minimal Gemini API response fixture containing text output. */
function geminiResponse(text: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [{ text }]
          }
        }
      ]
    })
  } as Response;
}
