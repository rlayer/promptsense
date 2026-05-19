/** Risk level assigned to an analysis result, phrase, or insight. */
export type Severity = "none" | "low" | "medium" | "high";

/** Supported analysis providers available in the UI. */
export type ProviderId = "mock" | "openai" | "anthropic" | "gemini";

/** Current lifecycle state for the live prompt analysis panel. */
export type AnalysisStatus = "idle" | "ready" | "analyzing" | "complete" | "error";

/** Current lifecycle state for provider model discovery. */
export type ModelListStatus = "fallback" | "loading" | "live" | "error";

/** Highlight class used to explain how prompt text relates to an edit. */
export type HighlightCategory = "changed" | "direct" | "indirect" | "no-impact";

/** Selectable model metadata exposed by a provider adapter. */
export interface ModelOption {
  /** Provider-specific model id used in API requests. */
  id: string;

  /** Human-readable model name shown in the UI. */
  label: string;

  /** Optional helper text describing model tradeoffs. */
  description?: string;
}

/** Input for provider model-list discovery. */
export interface ModelListRequest {
  /** Optional provider API key used to list account-available models. */
  apiKey?: string;

  /** Abort signal used to cancel stale model-list requests. */
  signal?: AbortSignal;
}

/** Token-expanded diff excerpt comparing the checkpoint prompt to the current prompt. */
export interface ChangedExcerpt {
  /** Stable excerpt id for provider prompts and UI keys. */
  id: string;

  /** Whether text was added, removed, or replaced. */
  kind: "added" | "removed" | "changed";

  /** Baseline text around the edit. */
  before: string;

  /** Current prompt text around the edit. */
  after: string;

  /** Start offset of the excerpt in the checkpoint prompt, when available. */
  baselineStart?: number;

  /** End offset of the excerpt in the checkpoint prompt, when available. */
  baselineEnd?: number;

  /** Start offset of the excerpt in the current prompt. */
  start: number;

  /** End offset of the excerpt in the current prompt. */
  end: number;
}

/** Provider-neutral request shape for analyzing the impact of a prompt edit. */
export interface PromptImpactRequest {
  /** Checkpoint prompt used as the comparison baseline. */
  baselinePrompt: string;

  /** Current prompt text being analyzed. */
  currentPrompt: string;

  /** Changed ranges extracted from the baseline/current prompt pair. */
  changedExcerpts: ChangedExcerpt[];

  /** Provider-specific model id selected for analysis. */
  model: string;

  /** Optional provider API key for live analysis. */
  apiKey?: string;

  /** Requested sampling temperature for the first structured attempt. */
  temperature: number;

  /** Abort signal used to cancel stale live analysis requests. */
  signal?: AbortSignal;
}

/** Phrase-level analysis item that can be mapped back onto prompt text. */
export interface ImpactPhrase {
  /** Exact or approximate phrase text from the current prompt. */
  text: string;

  /** Relationship between this phrase and the edit. */
  category: HighlightCategory;

  /** Estimated risk level for this phrase. */
  severity: Severity;

  /** Model confidence from 0 to 1. */
  confidence: number;

  /** Optional explanation for why this phrase matters. */
  reason?: string;

  /** Optional changed phrase that caused this impact. */
  sourceChange?: string;
}

/** Human-readable side effect surfaced in the insights panel. */
export interface ImpactInsight {
  /** Stable insight id for rendering. */
  id: string;

  /** Estimated risk level for this insight. */
  severity: Severity;

  /** Prompt phrase likely affected by the edit. */
  affectedPhrase: string;

  /** Changed phrase that may cause the side effect. */
  sourceChange: string;

  /** Expected behavioral change or risk. */
  expectedSideEffect: string;

  /** Model confidence from 0 to 1. */
  confidence: number;

  /** Targeted validation the user should run. */
  suggestedValidation: string;
}

/** Normalized analysis result consumed by the UI, regardless of provider. */
export interface PromptImpactResult {
  /** Short user-facing summary of the edit impact. */
  summary: string;

  /** Highest overall risk level for the result. */
  overallSeverity: Severity;

  /** Phrases directly changed by the edit. */
  changedPhrases: ImpactPhrase[];

  /** Other prompt phrases that may be affected. */
  affectedPhrases: ImpactPhrase[];

  /** Detailed side effects and validation suggestions. */
  insights: ImpactInsight[];

  /** Compact checklist of follow-up checks. */
  recommendedChecks: string[];

  /** Optional raw provider response for diagnostics. */
  rawResponse?: string;
}

/** Concrete text range to highlight in the current prompt. */
export interface HighlightSpan {
  /** Stable highlight id for rendering. */
  id: string;

  /** Start offset in the current prompt. */
  start: number;

  /** End offset in the current prompt. */
  end: number;

  /** Highlighted prompt text. */
  text: string;

  /** Visual highlight category. */
  category: HighlightCategory;

  /** Risk level attached to the highlighted text. */
  severity: Severity;

  /** Confidence from 0 to 1. */
  confidence: number;

  /** Whether the range came from fuzzy phrase matching. */
  fuzzy: boolean;
}

/** Render-ready prompt segment with an optional active highlight. */
export interface HighlightSegment {
  /** Segment text to render in the editor overlay. */
  text: string;

  /** Highlight metadata when the segment is affected. */
  span?: HighlightSpan;
}

/** Provider adapter contract for model listing and prompt-impact analysis. */
export interface ProviderAdapter {
  /** Provider id used for selection and API key storage. */
  id: ProviderId;

  /** Human-readable provider label shown in the UI. */
  label: string;

  /** Whether live analysis requires an API key. */
  requiresApiKey: boolean;

  /** Static model options used before or after API discovery fails. */
  fallbackModels: ModelOption[];

  /** Return provider-discovered model options when available. */
  listModels(input?: ModelListRequest): Promise<ModelOption[]>;

  /** Analyze the prompt edit and return a normalized result. */
  analyzePromptChange(input: PromptImpactRequest): Promise<PromptImpactResult>;
}
