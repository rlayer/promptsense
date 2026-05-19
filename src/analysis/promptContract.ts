import { jsonrepair } from "jsonrepair";
import type {
  ChangedExcerpt,
  ImpactInsight,
  ImpactPhrase,
  PromptImpactRequest,
  PromptImpactResult,
  Severity
} from "../types";

const SEVERITIES: Severity[] = ["none", "low", "medium", "high"];
const REQUIRED_RESULT_KEYS = [
  "summary",
  "overallSeverity",
  "changedPhrases",
  "affectedPhrases",
  "insights",
  "recommendedChecks"
];

export class PromptImpactParseError extends Error {
  /** Creates a parse error that preserves raw provider text and parse cause. */
  constructor(
    message: string,
    readonly rawText: string,
    readonly causeError?: unknown
  ) {
    super(message);
    this.name = "PromptImpactParseError";
  }
}

export interface AnalysisPromptMessages {
  system: string;
  user: string;
}

/**
 * Primary contract used for highlightable analysis.
 *
 * The prompt asks for strict JSON because the UI needs machine-readable phrase
 * arrays to map model output back onto the editor text.
 */
export function createAnalysisPrompt(
  input: PromptImpactRequest,
  options: { retry?: boolean } = {}
): AnalysisPromptMessages {
  return {
    system: [
      "You are PromptSense, a prompt change impact analyzer.",
      "Return strict JSON only. Do not wrap it in markdown.",
      options.retry
        ? "This is a retry because the previous response was incomplete or malformed. Return a complete JSON object with every required top-level key."
        : "",
      "Identify phrases changed by the edit and phrases elsewhere in the current prompt that may be affected.",
      "Focus especially on side effects outside the edited text: output schemas, examples, safety rules, tool instructions, persona, tone, and downstream parser assumptions.",
      "Use exact phrase text from the CURRENT prompt whenever possible so a UI can highlight it.",
      "Keep the response compact: at most 3 changed phrases, 5 affected phrases, 5 insights, and 5 checks.",
      "Keep every string under 180 characters. Escape quotes and newlines inside strings.",
      "Use severity values only: none, low, medium, high.",
      "Use confidence from 0 to 1."
    ]
      .filter(Boolean)
      .join(" "),
    user: JSON.stringify(
      {
        task: "Analyze prompt change impact.",
        returnPolicy:
          "Return one valid JSON object only. No markdown, no prose before or after JSON, no trailing commas.",
        limits: {
          changedPhrases: 3,
          affectedPhrases: 5,
          insights: 5,
          recommendedChecks: 5,
          maxStringLength: 180
        },
        responseShape: {
          summary: "string",
          overallSeverity: "none | low | medium | high",
          changedPhrases: [
            {
              text: "exact changed phrase from current prompt",
              category: "changed",
              severity: "none | low | medium | high",
              confidence: 0.9,
              reason: "why this phrase changed"
            }
          ],
          affectedPhrases: [
            {
              text: "exact phrase from current prompt outside the edited text",
              category: "direct | indirect | no-impact",
              severity: "none | low | medium | high",
              confidence: 0.7,
              sourceChange: "changed phrase that creates the impact",
              reason: "expected side effect"
            }
          ],
          insights: [
            {
              id: "stable short id",
              severity: "none | low | medium | high",
              affectedPhrase: "phrase from current prompt",
              sourceChange: "source changed phrase",
              expectedSideEffect: "specific impact",
              confidence: 0.7,
              suggestedValidation: "targeted check to run"
            }
          ],
          recommendedChecks: ["targeted validation to run"]
        },
        checkpoint: {
          promptLength: input.baselinePrompt.length,
          note: "The full checkpoint prompt is not sent in live mode. Use changedExcerpts.before for baseline text around the edit."
        },
        currentPrompt: input.currentPrompt,
        changedExcerpts: serializeChangedExcerpts(input.changedExcerpts)
      },
      null,
      2
    )
  };
}

/**
 * Last-resort contract used when structured JSON fails twice.
 *
 * Plain text cannot drive phrase highlights, but it still gives the user the
 * full analysis instead of a dead-end parser error.
 */
export function createPlainAnalysisPrompt(input: PromptImpactRequest): AnalysisPromptMessages {
  return {
    system: [
      "You are PromptSense, a prompt change impact analyzer.",
      "Return plain text only, not JSON.",
      "Give the full useful analysis for a human reviewer.",
      "Be concise but complete. Explain the direct change, likely side effects elsewhere in the prompt, and suggested checks."
    ].join(" "),
    user: JSON.stringify(
      {
        task: "Analyze prompt change impact in plain text.",
        format:
          "Use short sections named Summary, Direct impact, Side effects, and Checks. Do not return JSON.",
        checkpoint: {
          promptLength: input.baselinePrompt.length,
          note: "Use changedExcerpts.before for baseline text around the edit."
        },
        currentPrompt: input.currentPrompt,
        changedExcerpts: serializeChangedExcerpts(input.changedExcerpts)
      },
      null,
      2
    )
  };
}

/**
 * Parse provider JSON with conservative recovery.
 *
 * We repair common model mistakes, but reject incomplete recovered objects when
 * they would produce misleading partial analysis.
 */
export function parsePromptImpactJson(rawText: string): PromptImpactResult {
  const candidate = extractJsonCandidate(rawText);
  const attempts = uniqueRepairAttempts([
    { text: candidate, repaired: false },
    { text: repairLooseJson(candidate), repaired: true },
    { text: repairWithJsonRepair(candidate), repaired: true },
    { text: repairWithJsonRepair(repairLooseJson(candidate)), repaired: true }
  ]);
  let lastError: unknown;

  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt.text);
      const incomplete = isLikelyIncompleteJson(candidate);
      if (attempt.repaired && incomplete) {
        if (!hasCompleteImpactShape(parsed)) {
          throw new Error("Recovered JSON is incomplete.");
        }
        if (hasCutSummary(parsed) && !hasUsableInsight(parsed)) {
          throw new Error("Recovered JSON summary is incomplete.");
        }
      }
      return normalizePromptImpactResult(parsed, rawText, {
        repaired: attempt.repaired,
        incomplete
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw new PromptImpactParseError(
    "The model returned malformed JSON, so this analysis could not be applied. Try one more edit, lower temperature, or switch to a model with stronger JSON output.",
    rawText,
    lastError
  );
}

/**
 * Wrap a plain-text provider response in the same result shape the UI expects.
 * The prose itself cannot provide exact structured phrase ranges, so fallback
 * phrases are derived conservatively from the local checkpoint diff.
 */
export function createPlainTextImpactResult(
  rawText: string,
  input?: Pick<PromptImpactRequest, "changedExcerpts" | "currentPrompt">
): PromptImpactResult {
  const summary = normalizePlainText(rawText);
  const severity = inferPlainTextSeverity(summary);
  const changedPhrases = input ? fallbackChangedPhrases(input.changedExcerpts, severity) : [];
  const affectedPhrases = input
    ? fallbackAffectedPhrases(input.currentPrompt, input.changedExcerpts, severity)
    : [];
  const recommendedChecks = extractPlainTextChecks(summary);
  const insights = fallbackInsights(summary, changedPhrases, affectedPhrases, recommendedChecks, severity);

  return {
    summary,
    overallSeverity: severity,
    changedPhrases,
    affectedPhrases,
    insights,
    recommendedChecks,
    rawResponse: rawText
  };
}

/** Normalizes arbitrary parsed provider JSON into the app's result shape. */
export function normalizePromptImpactResult(
  value: unknown,
  rawResponse?: string,
  options: { repaired?: boolean; incomplete?: boolean } = {}
): PromptImpactResult {
  if (!isRecord(value)) {
    throw new Error("Model response was not a JSON object.");
  }

  const changedPhrases = asArray(value.changedPhrases).map((item, index) =>
    normalizePhrase(item, index, "changed")
  );
  const affectedPhrases = asArray(value.affectedPhrases).map((item, index) =>
    normalizePhrase(item, index, "indirect")
  );
  const insights = asArray(value.insights).map(normalizeInsight);

  const result: PromptImpactResult = {
    summary: normalizeSummary(asString(value.summary, "No summary returned."), options, insights),
    overallSeverity: asSeverity(value.overallSeverity, "medium"),
    changedPhrases,
    affectedPhrases,
    insights,
    recommendedChecks: asArray(value.recommendedChecks)
      .map((item) => asString(item, ""))
      .filter(Boolean),
    rawResponse
  };

  return result;
}

/** Removes wrapping fences and whitespace from plain-text fallback output. */
function normalizePlainText(rawText: string): string {
  const text = rawText
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return text || "No analysis returned.";
}

/** Infers a fallback severity from keywords in plain-text analysis. */
function inferPlainTextSeverity(text: string): Severity {
  const lowerText = text.toLowerCase();
  if (/\b(high|major|breaking|schema|safety|security|privacy|parser)\b/.test(lowerText)) {
    return "high";
  }
  if (/\b(medium|ambiguous|side effect|side-effect|affect|risk)\b/.test(lowerText)) {
    return "medium";
  }
  if (/\b(low|minor|localized|style|tone)\b/.test(lowerText)) {
    return "low";
  }
  return "medium";
}

/** Derives highlightable changed phrases from current-side diff text. */
function fallbackChangedPhrases(excerpts: ChangedExcerpt[], severity: Severity): ImpactPhrase[] {
  return excerpts
    .map<ImpactPhrase | undefined>((excerpt) => {
      const text = promptPhrase(excerpt.after);
      if (!text) {
        return undefined;
      }
      return {
        text,
        category: "changed" as const,
        severity,
        confidence: 0.65,
        reason: "Derived from the local checkpoint diff after plain-text fallback."
      };
    })
    .filter(isImpactPhrase)
    .slice(0, 3);
}

/** Narrows optional fallback phrase values after filtering. */
function isImpactPhrase(phrase: ImpactPhrase | undefined): phrase is ImpactPhrase {
  return Boolean(phrase);
}

/** Derives current prompt context for removed checkpoint text. */
function fallbackAffectedPhrases(
  currentPrompt: string,
  excerpts: ChangedExcerpt[],
  severity: Severity
): ImpactPhrase[] {
  return excerpts
    .filter((excerpt) => excerpt.kind === "removed")
    .map((excerpt) => fallbackCurrentContext(currentPrompt, excerpt.start))
    .filter((text): text is string => Boolean(text))
    .filter(uniqueText)
    .slice(0, 5)
    .map((text) => ({
      text,
      category: "direct" as const,
      severity,
      confidence: 0.45,
      sourceChange: "Removed checkpoint text",
      reason: "Current prompt context near removed checkpoint text."
    }));
}

/** Converts plain-text fallback sections into lightweight insight cards. */
function fallbackInsights(
  summary: string,
  changedPhrases: ImpactPhrase[],
  affectedPhrases: ImpactPhrase[],
  checks: string[],
  severity: Severity
): ImpactInsight[] {
  const phrases = [...affectedPhrases, ...changedPhrases];
  const sideEffects = sectionItems(summary, "Side effects");
  const directImpacts = sectionItems(summary, "Direct impact");
  const effects = [...sideEffects, ...directImpacts].slice(0, 5);

  return effects.map((effect, index) => {
    const phrase = phrases[index % Math.max(phrases.length, 1)];
    return {
      id: `plain-fallback-${index + 1}`,
      severity,
      affectedPhrase: phrase?.text ?? "Changed prompt text",
      sourceChange: phrase?.sourceChange ?? phrase?.text ?? "Changed prompt text",
      expectedSideEffect: truncateText(cleanPlainTextItem(effect), 180),
      confidence: 0.45,
      suggestedValidation: checks[index] ?? "Review this prompt behavior against expected outputs."
    };
  });
}

/** Extracts recommended checks from a plain-text fallback response. */
function extractPlainTextChecks(text: string): string[] {
  return sectionItems(text, "Checks").map(cleanPlainTextItem).filter(Boolean).slice(0, 5);
}

/** Parses list-like items from a named plain-text section. */
function sectionItems(text: string, title: string): string[] {
  const body = sectionBody(text, title);
  if (!body) {
    return [];
  }

  const items: string[] = [];
  let current = "";
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const item = /^(?:\d+\.|[-*])\s+(.+)$/.exec(line);
    if (item) {
      if (current) {
        items.push(current);
      }
      current = item[1];
      continue;
    }

    current = current ? `${current} ${line}` : line;
  }

  if (current) {
    items.push(current);
  }
  return items;
}

/** Extracts the body text belonging to a named plain-text section. */
function sectionBody(text: string, title: string): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => isPlainSectionLine(line, title));
  if (start === -1) {
    return "";
  }

  const firstLine = lines[start].trim();
  const inlineBody = firstLine.slice(title.length).replace(/^:\s*/, "");
  const body = inlineBody ? [inlineBody] : [];
  for (const line of lines.slice(start + 1)) {
    if (isAnyPlainSectionLine(line)) {
      break;
    }
    body.push(line);
  }
  return body.join("\n").trim();
}

/** Checks whether a line starts any supported plain-text section. */
function isAnyPlainSectionLine(line: string): boolean {
  return ["Summary", "Direct impact", "Side effects", "Checks"].some((title) =>
    isPlainSectionLine(line, title)
  );
}

/** Checks whether a line starts a specific plain-text section. */
function isPlainSectionLine(line: string, title: string): boolean {
  const trimmed = line.trim().toLocaleLowerCase();
  const normalizedTitle = title.toLocaleLowerCase();
  return trimmed === normalizedTitle || trimmed.startsWith(`${normalizedTitle}:`);
}

/** Finds nearby current-prompt context for a removed checkpoint range. */
function fallbackCurrentContext(prompt: string, offset: number): string {
  const lines = prompt.split("\n");
  const lineIndex = lineIndexAtOffset(lines, offset);

  for (let index = lineIndex; index >= 0; index -= 1) {
    const text = lines[index].trim();
    if (/^#{1,6}\s+\S/.test(text)) {
      return text;
    }
  }

  for (let index = lineIndex; index >= 0; index -= 1) {
    const text = lines[index].trim();
    if (text) {
      return text;
    }
  }

  return "";
}

/** Maps a character offset to its containing line index. */
function lineIndexAtOffset(lines: string[], offset: number): number {
  let cursor = 0;
  for (let index = 0; index < lines.length; index += 1) {
    cursor += lines[index].length + 1;
    if (offset < cursor) {
      return index;
    }
  }
  return Math.max(0, lines.length - 1);
}

/** Cleans and truncates diff text for use as a fallback phrase. */
function promptPhrase(text: string): string {
  return truncateText(text.trim(), 180);
}

/** Truncates long text to a maximum display length. */
function truncateText(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

/** Removes lightweight markdown emphasis from fallback list items. */
function cleanPlainTextItem(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

/** Keeps the first case-insensitive occurrence of a text value. */
function uniqueText(text: string, index: number, values: string[]): boolean {
  return (
    values.findIndex((value) => value.toLocaleLowerCase() === text.toLocaleLowerCase()) === index
  );
}

/** Serializes changed excerpts for provider prompts. */
function serializeChangedExcerpts(excerpts: ChangedExcerpt[]) {
  return excerpts.map((excerpt) => ({
    id: excerpt.id,
    kind: excerpt.kind,
    before: excerpt.before,
    after: excerpt.after,
    currentPromptRange: [excerpt.start, excerpt.end]
  }));
}

/** Deduplicates JSON repair attempts while preserving order. */
function uniqueRepairAttempts(
  attempts: Array<{ text: string; repaired: boolean }>
): Array<{ text: string; repaired: boolean }> {
  const seen = new Set<string>();
  return attempts.filter((attempt) => {
    const key = `${attempt.repaired}:${attempt.text}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/** Extracts the most likely JSON object from a provider response. */
function extractJsonCandidate(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const unfenced = fenced ? fenced[1].trim() : trimmed;
  return extractFirstJsonObject(unfenced) ?? unfenced;
}

/** Detects unterminated strings or object braces in candidate JSON. */
function isLikelyIncompleteJson(text: string): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (const char of text) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
    }
  }

  return inString || depth > 0;
}

/** Checks whether parsed JSON contains all required top-level result keys. */
function hasCompleteImpactShape(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return REQUIRED_RESULT_KEYS.every((key) => key in value);
}

/** Checks whether a parsed summary looks truncated. */
function hasCutSummary(value: unknown): boolean {
  return isRecord(value) && typeof value.summary === "string" && looksCutOff(value.summary);
}

/** Checks whether recovered JSON has at least one usable insight body. */
function hasUsableInsight(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.insights)) {
    return false;
  }

  return value.insights.some(
    (insight) =>
      isRecord(insight) &&
      typeof insight.expectedSideEffect === "string" &&
      insight.expectedSideEffect.trim().length > 0
  );
}

/** Returns the first balanced JSON object found in surrounding text. */
function extractFirstJsonObject(text: string): string | undefined {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (start === -1) {
      if (char === "{") {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return undefined;
}

/** Applies cheap repairs for common model JSON formatting mistakes. */
function repairLooseJson(text: string): string {
  return escapeControlCharactersInsideStrings(text)
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/^\uFEFF/, "");
}

/** Runs jsonrepair and falls back to the original text on failure. */
function repairWithJsonRepair(text: string): string {
  try {
    return jsonrepair(text);
  } catch {
    return text;
  }
}

/** Escapes raw control characters that appear inside JSON strings. */
function escapeControlCharactersInsideStrings(text: string): string {
  let inString = false;
  let escaped = false;
  let output = "";

  for (const char of text) {
    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      output += char;
      escaped = true;
      continue;
    }

    if (char === "\"") {
      output += char;
      inString = !inString;
      continue;
    }

    if (inString && char === "\n") {
      output += "\\n";
      continue;
    }

    if (inString && char === "\r") {
      output += "\\r";
      continue;
    }

    if (inString && char === "\t") {
      output += "\\t";
      continue;
    }

    output += char;
  }

  return output;
}

/** Normalizes one model phrase item with defensive defaults. */
function normalizePhrase(
  value: unknown,
  index: number,
  fallbackCategory: ImpactPhrase["category"]
): ImpactPhrase {
  const record = isRecord(value) ? value : {};
  return {
    text: asString(record.text, ""),
    category:
      record.category === "changed" ||
      record.category === "direct" ||
      record.category === "indirect" ||
      record.category === "no-impact"
        ? record.category
        : fallbackCategory,
    severity: asSeverity(record.severity, index === 0 ? "medium" : "low"),
    confidence: asConfidence(record.confidence),
    reason: asOptionalString(record.reason),
    sourceChange: asOptionalString(record.sourceChange)
  };
}

/** Normalizes one model insight item with defensive defaults. */
function normalizeInsight(value: unknown, index: number): ImpactInsight {
  const record = isRecord(value) ? value : {};
  return {
    id: asString(record.id, `insight-${index + 1}`),
    severity: asSeverity(record.severity, "medium"),
    affectedPhrase: asString(record.affectedPhrase, ""),
    sourceChange: asString(record.sourceChange, ""),
    expectedSideEffect: asString(record.expectedSideEffect, ""),
    confidence: asConfidence(record.confidence),
    suggestedValidation: asString(record.suggestedValidation, "Review this prompt behavior.")
  };
}

/** Selects the safest summary text after JSON repair. */
function normalizeSummary(
  summary: string,
  options: { repaired?: boolean; incomplete?: boolean },
  insights: ImpactInsight[]
): string {
  const trimmed = summary.trim();
  if (!trimmed) {
    return "No summary returned.";
  }

  if (options.repaired && options.incomplete && looksCutOff(trimmed)) {
    const recoveredInsight = insights.find((insight) => insight.expectedSideEffect.trim());
    if (recoveredInsight) {
      return compactSentence(recoveredInsight.expectedSideEffect);
    }
  }

  return trimmed;
}

/** Compacts text to a short sentence-like summary. */
function compactSentence(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 180) {
    return trimmed;
  }

  const prefix = trimmed.slice(0, 180);
  const sentenceEnd = Math.max(prefix.lastIndexOf("."), prefix.lastIndexOf("!"), prefix.lastIndexOf("?"));
  if (sentenceEnd > 60) {
    return prefix.slice(0, sentenceEnd + 1);
  }

  return `${prefix.slice(0, 177).trim()}...`;
}

/** Checks whether text appears to end mid-sentence. */
function looksCutOff(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }
  return !/[.!?)]$/.test(trimmed);
}

/** Coerces a value into a supported severity. */
function asSeverity(value: unknown, fallback: Severity): Severity {
  return typeof value === "string" && SEVERITIES.includes(value as Severity)
    ? (value as Severity)
    : fallback;
}

/** Coerces a value into a bounded confidence score. */
function asConfidence(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0.5;
}

/** Coerces a value into a string with fallback. */
function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/** Returns a non-empty string or undefined. */
function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** Coerces an unknown value into an array. */
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Narrows unknown values to plain object records. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
