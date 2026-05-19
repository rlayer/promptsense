import type { ChangedExcerpt } from "../types";
import { buildLcsDiffOps, type LcsDiffOp } from "./lcs";

const TOKEN_CHAR = /[A-Za-z0-9_-]/;
const MAX_LCS_CELLS = 1_000_000;
const MERGE_NEARBY_EDIT_GAP_CHARS = 80;

interface TextLine {
  text: string;
  start: number;
  end: number;
}

interface Range {
  start: number;
  end: number;
}

interface DiffHunk {
  kind: ChangedExcerpt["kind"];
  baseline: Range;
  current: Range;
}

/** Extracts checkpoint-relative changed excerpts between two prompt versions. */
export function extractChangedExcerpts(
  baselinePrompt: string,
  currentPrompt: string
): ChangedExcerpt[] {
  if (baselinePrompt === currentPrompt) {
    return [];
  }

  const baselineLines = splitLines(baselinePrompt);
  const currentLines = splitLines(currentPrompt);
  const cellCount = (baselineLines.length + 1) * (currentLines.length + 1);

  if (cellCount > MAX_LCS_CELLS) {
    return [
      hunkToExcerpt(fullPromptHunk(baselinePrompt, currentPrompt), baselinePrompt, currentPrompt, 0)
    ];
  }

  const ops = buildLcsDiffOps(
    baselineLines,
    currentLines,
    (baselineLine, currentLine) => baselineLine.text === currentLine.text
  );

  return mergeNearbyHunks(opsToHunks(ops))
    .map((hunk, index) => hunkToExcerpt(hunk, baselinePrompt, currentPrompt, index))
    .filter((excerpt) => excerpt.before.length > 0 || excerpt.after.length > 0);
}

/** Builds a single fallback hunk covering both full prompts. */
function fullPromptHunk(baselinePrompt: string, currentPrompt: string): DiffHunk {
  return {
    kind: kindFor(baselinePrompt.length > 0, currentPrompt.length > 0),
    baseline: { start: 0, end: baselinePrompt.length },
    current: { start: 0, end: currentPrompt.length }
  };
}

/** Converts an internal diff hunk into the public changed-excerpt shape. */
function hunkToExcerpt(
  hunk: DiffHunk,
  baselinePrompt: string,
  currentPrompt: string,
  index: number
): ChangedExcerpt {
  const beforeText = sliceRange(baselinePrompt, hunk.baseline);
  const afterText = sliceRange(currentPrompt, hunk.current);
  const prefix = commonPrefixLength(beforeText, afterText);
  const suffix = commonSuffixLength(beforeText, afterText, prefix);
  const beforeEnd = beforeText.length - suffix;
  const afterEnd = afterText.length - suffix;
  const beforeRange = changedRange(baselinePrompt, hunk.baseline, prefix, beforeEnd);
  const afterRange = changedRange(currentPrompt, hunk.current, prefix, afterEnd);

  return {
    id: `change-${index + 1}`,
    kind: kindFor(beforeEnd > prefix, afterEnd > prefix),
    before: sliceRange(baselinePrompt, beforeRange),
    after: sliceRange(currentPrompt, afterRange),
    baselineStart: beforeRange.start,
    baselineEnd: beforeRange.end,
    start: afterRange.start,
    end: afterRange.end
  };
}

/** Splits text into newline-preserving lines with absolute offsets. */
function splitLines(text: string): TextLine[] {
  const lines: TextLine[] = [];
  let start = 0;

  while (start < text.length) {
    const newlineIndex = text.indexOf("\n", start);
    const end = newlineIndex === -1 ? text.length : newlineIndex + 1;
    lines.push({ text: text.slice(start, end), start, end });
    start = end;
  }

  return lines;
}

/** Groups LCS edit operations into raw checkpoint/current hunks. */
function opsToHunks(ops: LcsDiffOp<TextLine>[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let edits: LcsDiffOp<TextLine>[] = [];
  let baselineCursor = 0;
  let currentCursor = 0;

  /** Emits the current edit group as a hunk and resets the group. */
  const flushEdits = () => {
    if (edits.length === 0) {
      return;
    }
    hunks.push(buildHunk(edits, baselineCursor, currentCursor));
    edits = [];
  };

  for (const op of ops) {
    if (op.type === "same") {
      flushEdits();
      baselineCursor = op.beforeItem.end;
      currentCursor = op.afterItem.end;
      continue;
    }

    edits.push(op);
  }

  flushEdits();
  return hunks;
}

/** Builds a hunk range pair from adjacent insert/delete operations. */
function buildHunk(
  edits: LcsDiffOp<TextLine>[],
  baselineFallbackOffset: number,
  currentFallbackOffset: number
): DiffHunk {
  const baseline = lineRange(
    edits.flatMap((op) => (op.type === "delete" ? [op.beforeItem] : [])),
    baselineFallbackOffset
  );
  const current = lineRange(
    edits.flatMap((op) => (op.type === "insert" ? [op.afterItem] : [])),
    currentFallbackOffset
  );

  return {
    kind: kindFor(!isCollapsed(baseline), !isCollapsed(current)),
    baseline,
    current
  };
}

/** Converts deleted or inserted lines into a text range. */
function lineRange(lines: TextLine[], fallbackOffset: number): Range {
  const start = lines[0]?.start ?? fallbackOffset;
  return { start, end: lines.at(-1)?.end ?? start };
}

/** Merges nearby hunks of the same change kind for compact reporting. */
function mergeNearbyHunks(hunks: DiffHunk[]): DiffHunk[] {
  const merged: DiffHunk[] = [];

  for (const hunk of hunks) {
    const previous = merged.at(-1);
    if (!previous || !shouldMergeHunks(previous, hunk)) {
      merged.push(hunk);
      continue;
    }

    previous.baseline.end = hunk.baseline.end;
    previous.current.end = hunk.current.end;
  }

  return merged;
}

/** Decides whether two hunks are close enough and compatible to merge. */
function shouldMergeHunks(left: DiffHunk, right: DiffHunk): boolean {
  if (left.kind !== right.kind) {
    return false;
  }

  const baselineGap = right.baseline.start - left.baseline.end;
  const currentGap = right.current.start - left.current.end;
  return (
    baselineGap >= 0 &&
    currentGap >= 0 &&
    Math.max(baselineGap, currentGap) <= MERGE_NEARBY_EDIT_GAP_CHARS
  );
}

/** Converts hunk-relative offsets into token-expanded absolute ranges. */
function changedRange(text: string, base: Range, startOffset: number, endOffset: number): Range {
  const range = {
    start: base.start + startOffset,
    end: base.start + endOffset
  };

  return isCollapsed(range) ? range : expandToTokenBoundaries(text, range);
}

/** Classifies a change by whether baseline and current text are present. */
function kindFor(hasBefore: boolean, hasAfter: boolean): ChangedExcerpt["kind"] {
  if (!hasBefore) {
    return "added";
  }
  if (!hasAfter) {
    return "removed";
  }
  return "changed";
}

/** Slices text with a range object. */
function sliceRange(text: string, range: Range): string {
  return text.slice(range.start, range.end);
}

/** Checks whether a range represents an insertion point rather than text. */
function isCollapsed(range: Range): boolean {
  return range.start === range.end;
}

/** Counts equal characters from the start of two strings. */
function commonPrefixLength(left: string, right: string): number {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

/** Expands a non-empty range outward to include full token characters. */
function expandToTokenBoundaries(text: string, range: Range): Range {
  let { start, end } = range;

  while (start > 0 && isTokenChar(text[start - 1]) && isTokenChar(text[start])) {
    start -= 1;
  }
  while (end < text.length && isTokenChar(text[end - 1]) && isTokenChar(text[end])) {
    end += 1;
  }

  return { start, end };
}

/** Checks whether a character belongs to the diff token class. */
function isTokenChar(char: string | undefined): boolean {
  return Boolean(char && TOKEN_CHAR.test(char));
}

/** Counts equal trailing characters without overlapping a known common prefix. */
function commonSuffixLength(left: string, right: string, prefixLength = 0): number {
  const max = Math.min(left.length, right.length) - prefixLength;
  let index = 0;
  while (
    index < max &&
    left[left.length - 1 - index] === right[right.length - 1 - index]
  ) {
    index += 1;
  }
  return index;
}
