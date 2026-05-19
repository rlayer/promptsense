import type { ChangedExcerpt } from "../types";
import { buildLcsDiffOps } from "./lcs";

const MAX_INLINE_DIFF_CELLS = 250_000;
const DIFF_TOKEN_PATTERN = /\s+|[A-Za-z0-9_-]+|[^\sA-Za-z0-9_-]+/g;

export type VisualDiffKind = "same" | "added" | "removed";

export interface VisualDiffSegment {
  text: string;
  kind: VisualDiffKind;
}

export interface SideBySideDiff {
  before: VisualDiffSegment[];
  after: VisualDiffSegment[];
}

/** Builds full before/after visual segments for the checkpoint diff preview. */
export function buildSideBySideDiff(
  baselinePrompt: string,
  currentPrompt: string,
  excerpts: ChangedExcerpt[]
): SideBySideDiff {
  const before: VisualDiffSegment[] = [];
  const after: VisualDiffSegment[] = [];
  let baselineCursor = 0;
  let currentCursor = 0;

  for (const excerpt of excerpts) {
    const baselineStart = clampOffset(
      excerpt.baselineStart ?? findFallbackRange(baselinePrompt, excerpt.before, baselineCursor)[0],
      baselinePrompt
    );
    const baselineEnd = clampOffset(
      excerpt.baselineEnd ?? findFallbackRange(baselinePrompt, excerpt.before, baselineStart)[1],
      baselinePrompt
    );
    const currentStart = clampOffset(excerpt.start, currentPrompt);
    const currentEnd = clampOffset(excerpt.end, currentPrompt);

    appendSegment(before, baselinePrompt.slice(baselineCursor, baselineStart), "same");
    appendSegment(after, currentPrompt.slice(currentCursor, currentStart), "same");

    const inline = buildInlineDiff(
      baselinePrompt.slice(baselineStart, baselineEnd),
      currentPrompt.slice(currentStart, currentEnd)
    );
    appendSegments(before, inline.before);
    appendSegments(after, inline.after);

    baselineCursor = baselineEnd;
    currentCursor = currentEnd;
  }

  appendSegment(before, baselinePrompt.slice(baselineCursor), "same");
  appendSegment(after, currentPrompt.slice(currentCursor), "same");

  return { before, after };
}

/** Builds token-level visual diff segments for one changed range. */
function buildInlineDiff(beforeText: string, afterText: string): SideBySideDiff {
  if (beforeText === afterText) {
    return {
      before: [{ text: beforeText, kind: "same" }],
      after: [{ text: afterText, kind: "same" }]
    };
  }

  if (!beforeText) {
    return {
      before: [],
      after: [{ text: afterText, kind: "added" }]
    };
  }

  if (!afterText) {
    return {
      before: [{ text: beforeText, kind: "removed" }],
      after: []
    };
  }

  const beforeTokens = tokenize(beforeText);
  const afterTokens = tokenize(afterText);
  const cellCount = (beforeTokens.length + 1) * (afterTokens.length + 1);

  if (cellCount > MAX_INLINE_DIFF_CELLS) {
    return {
      before: [{ text: beforeText, kind: "removed" }],
      after: [{ text: afterText, kind: "added" }]
    };
  }

  const ops = buildLcsDiffOps(beforeTokens, afterTokens);
  const before: VisualDiffSegment[] = [];
  const after: VisualDiffSegment[] = [];

  for (const op of ops) {
    if (op.type === "same") {
      appendSegment(before, op.beforeItem, "same");
      appendSegment(after, op.afterItem, "same");
    } else if (op.type === "delete") {
      appendSegment(before, op.beforeItem, "removed");
    } else {
      appendSegment(after, op.afterItem, "added");
    }
  }

  return { before, after };
}

/** Tokenizes text for inline visual diffing. */
function tokenize(text: string): string[] {
  return text.match(DIFF_TOKEN_PATTERN) ?? [];
}

/** Appends multiple visual segments while preserving merge behavior. */
function appendSegments(target: VisualDiffSegment[], segments: VisualDiffSegment[]) {
  for (const segment of segments) {
    appendSegment(target, segment.text, segment.kind);
  }
}

/** Appends a visual segment and coalesces adjacent segments of the same kind. */
function appendSegment(target: VisualDiffSegment[], text: string, kind: VisualDiffKind) {
  if (!text) {
    return;
  }

  const previous = target.at(-1);
  if (previous?.kind === kind) {
    previous.text += text;
    return;
  }

  target.push({ text, kind });
}

/** Finds a phrase range when an excerpt lacks explicit baseline offsets. */
function findFallbackRange(text: string, phrase: string, cursor: number): [number, number] {
  if (!phrase) {
    return [cursor, cursor];
  }

  const start = text.indexOf(phrase, cursor);
  if (start === -1) {
    return [cursor, cursor];
  }
  return [start, start + phrase.length];
}

/** Clamps a character offset to the bounds of a string. */
function clampOffset(offset: number, text: string): number {
  return Math.max(0, Math.min(text.length, offset));
}
