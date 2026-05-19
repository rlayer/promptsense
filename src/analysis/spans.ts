import type {
  HighlightCategory,
  HighlightSegment,
  HighlightSpan,
  ImpactPhrase,
  PromptImpactResult
} from "../types";

const CATEGORY_PRIORITY: Record<HighlightCategory, number> = {
  changed: 4,
  direct: 3,
  indirect: 2,
  "no-impact": 1
};

/** Maps model impact phrases back onto highlightable prompt ranges. */
export function mapImpactToSpans(
  prompt: string,
  result: PromptImpactResult
): HighlightSpan[] {
  const phrases = [
    ...result.changedPhrases.map((phrase) => ({ ...phrase, category: "changed" as const })),
    ...result.affectedPhrases
  ];

  const usedRanges: Array<[number, number]> = [];
  return phrases
    .flatMap((phrase, index) => phraseToSpan(prompt, phrase, index, usedRanges))
    .sort((left, right) => left.start - right.start || right.end - left.end);
}

/** Splits prompt text into render segments with optional highlight metadata. */
export function buildHighlightSegments(
  text: string,
  spans: HighlightSpan[]
): HighlightSegment[] {
  if (text.length === 0) {
    return [{ text }];
  }

  const spanByCharacter: Array<HighlightSpan | undefined> = Array.from({
    length: text.length
  });

  for (const span of spans) {
    for (let index = span.start; index < span.end && index < text.length; index += 1) {
      const current = spanByCharacter[index];
      if (!current || CATEGORY_PRIORITY[span.category] > CATEGORY_PRIORITY[current.category]) {
        spanByCharacter[index] = span;
      }
    }
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const activeSpan = spanByCharacter[cursor];
    let end = cursor + 1;
    while (end < text.length && spanByCharacter[end] === activeSpan) {
      end += 1;
    }
    segments.push({ text: text.slice(cursor, end), span: activeSpan });
    cursor = end;
  }
  return segments;
}

/** Converts one impact phrase into a non-overlapping highlight span. */
function phraseToSpan(
  prompt: string,
  phrase: ImpactPhrase,
  index: number,
  usedRanges: Array<[number, number]>
): HighlightSpan[] {
  const normalizedPhrase = phrase.text.trim();
  if (!normalizedPhrase) {
    return [];
  }

  const exact = findExact(prompt, normalizedPhrase, usedRanges);
  const range = exact ?? findFuzzy(prompt, normalizedPhrase, usedRanges);
  if (!range) {
    return [];
  }

  const fuzzy = !exact;
  usedRanges.push(range);
  return [
    {
      id: `${phrase.category}-${index}`,
      start: range[0],
      end: range[1],
      text: prompt.slice(range[0], range[1]),
      category: phrase.category,
      severity: phrase.severity,
      confidence: fuzzy
        ? Math.min(0.6, clampConfidence(phrase.confidence))
        : clampConfidence(phrase.confidence),
      fuzzy
    }
  ];
}

/** Finds a case-insensitive exact phrase match outside used ranges. */
function findExact(
  prompt: string,
  phrase: string,
  usedRanges: Array<[number, number]>
): [number, number] | undefined {
  const haystack = prompt.toLocaleLowerCase();
  const needle = phrase.toLocaleLowerCase();
  let cursor = 0;

  while (cursor < haystack.length) {
    const start = haystack.indexOf(needle, cursor);
    if (start === -1) {
      return undefined;
    }
    const end = start + phrase.length;
    if (!overlaps(start, end, usedRanges)) {
      return [start, end];
    }
    cursor = start + 1;
  }

  return undefined;
}

/** Finds the best fuzzy prompt chunk for a phrase outside used ranges. */
function findFuzzy(
  prompt: string,
  phrase: string,
  usedRanges: Array<[number, number]>
): [number, number] | undefined {
  const phraseTokens = tokenize(phrase);
  if (phraseTokens.size === 0) {
    return undefined;
  }

  const chunks = chunkPrompt(prompt);
  let best: { range: [number, number]; score: number } | undefined;

  for (const chunk of chunks) {
    if (overlaps(chunk.start, chunk.end, usedRanges)) {
      continue;
    }
    const score = jaccard(phraseTokens, tokenize(chunk.text));
    if (!best || score > best.score) {
      best = { range: [chunk.start, chunk.end], score };
    }
  }

  return best && best.score >= 0.3 ? best.range : undefined;
}

/** Breaks prompt text into sentence- or line-sized chunks for fuzzy matching. */
function chunkPrompt(prompt: string): Array<{ start: number; end: number; text: string }> {
  const chunks: Array<{ start: number; end: number; text: string }> = [];
  const matcher = /[^\n.!?]+(?:[.!?]+|\n|$)/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(prompt)) !== null) {
    const raw = match[0];
    const leadingWhitespace = raw.match(/^\s*/)?.[0].length ?? 0;
    const trailingWhitespace = raw.match(/\s*$/)?.[0].length ?? 0;
    const start = match.index + leadingWhitespace;
    const end = match.index + raw.length - trailingWhitespace;
    if (end > start) {
      chunks.push({ start, end, text: prompt.slice(start, end) });
    }
  }

  return chunks.length > 0 ? chunks : [{ start: 0, end: prompt.length, text: prompt }];
}

/** Extracts lowercase matching tokens from text. */
function tokenize(text: string): Set<string> {
  return new Set(text.toLocaleLowerCase().match(/[a-z0-9_-]{3,}/g) ?? []);
}

/** Computes Jaccard similarity between two token sets. */
function jaccard(left: Set<string>, right: Set<string>): number {
  const union = new Set([...left, ...right]);
  if (union.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  return intersection / union.size;
}

/** Checks whether a candidate range intersects any already-used range. */
function overlaps(start: number, end: number, usedRanges: Array<[number, number]>): boolean {
  return usedRanges.some(([usedStart, usedEnd]) => start < usedEnd && end > usedStart);
}

/** Normalizes model confidence into the 0-1 range. */
function clampConfidence(confidence: number): number {
  if (Number.isNaN(confidence)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, confidence));
}
