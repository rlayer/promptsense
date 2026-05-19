import { useEffect, useMemo, useRef } from "react";
import { buildSideBySideDiff } from "../analysis/visualDiff";
import type { ChangedExcerpt } from "../types";
import type { VisualDiffSegment } from "../analysis/visualDiff";

interface VisualDiffLine {
  number: number;
  segments: VisualDiffSegment[];
}

interface PromptDiffPreviewProps {
  baselinePrompt: string;
  currentPrompt: string;
  changedExcerpts: ChangedExcerpt[];
  changedSectionLabel: string;
}

/** Renders the stable checkpoint/current prompt comparison preview. */
export function PromptDiffPreview({
  baselinePrompt,
  currentPrompt,
  changedExcerpts,
  changedSectionLabel
}: PromptDiffPreviewProps) {
  const checkpointCodeRef = useRef<HTMLDivElement>(null);
  const currentCodeRef = useRef<HTMLDivElement>(null);
  const syncingScrollRef = useRef(false);
  const diff = useMemo(
    () => buildSideBySideDiff(baselinePrompt, currentPrompt, changedExcerpts),
    [baselinePrompt, changedExcerpts, currentPrompt]
  );

  useEffect(() => {
    resetScroll(checkpointCodeRef.current);
    resetScroll(currentCodeRef.current);
  }, [baselinePrompt, changedExcerpts, currentPrompt]);

  /** Mirrors scroll offsets between the two diff panes. */
  function syncScroll(source: HTMLDivElement, target: HTMLDivElement | null) {
    if (!target || syncingScrollRef.current) {
      return;
    }

    syncingScrollRef.current = true;
    target.scrollTop = source.scrollTop;
    target.scrollLeft = source.scrollLeft;
    syncingScrollRef.current = false;
  }

  return (
    <section className="diff-preview" aria-label="Full prompt comparison">
      <div className="diff-preview-heading">
        <h2>Checkpoint diff</h2>
        <span>{changedSectionLabel}</span>
      </div>
      <div className="diff-grid">
        <article className="diff-column">
          <header>
            <strong>Checkpoint</strong>
          </header>
          <div
            aria-label="Checkpoint diff text"
            className="diff-code"
            onScroll={(event) => syncScroll(event.currentTarget, currentCodeRef.current)}
            ref={checkpointCodeRef}
          >
            {renderLines(diff.before)}
          </div>
        </article>
        <article className="diff-column">
          <header>
            <strong>Current prompt</strong>
          </header>
          <div
            aria-label="Current prompt diff text"
            className="diff-code"
            onScroll={(event) => syncScroll(event.currentTarget, checkpointCodeRef.current)}
            ref={currentCodeRef}
          >
            {renderLines(diff.after)}
          </div>
        </article>
      </div>
    </section>
  );
}

/** Resets a diff pane to its top-left origin after prompt changes. */
function resetScroll(element: HTMLDivElement | null) {
  if (!element) {
    return;
  }

  element.scrollTop = 0;
  element.scrollLeft = 0;
}

/** Renders numbered visual diff lines from flat text segments. */
function renderLines(segments: VisualDiffSegment[]) {
  return splitSegmentsIntoLines(segments).map((line) => (
    <div className="diff-line" key={line.number}>
      <span className="diff-line-number" aria-hidden="true">
        {line.number}
      </span>
      <code className="diff-line-content">{renderSegments(line.segments)}</code>
    </div>
  ));
}

/** Renders inline diff marks for changed visual segments. */
function renderSegments(segments: VisualDiffSegment[]) {
  return segments.map((segment, index) =>
    segment.kind === "same" ? (
      <span key={`same-${index}`}>{segment.text}</span>
    ) : (
      <mark key={`${segment.kind}-${index}`} className={`diff-mark diff-mark-${segment.kind}`}>
        {segment.text}
      </mark>
    )
  );
}

/** Splits visual diff segments on newlines while preserving segment kinds. */
function splitSegmentsIntoLines(segments: VisualDiffSegment[]): VisualDiffLine[] {
  const lines: VisualDiffSegment[][] = [[]];

  for (const segment of segments) {
    const parts = segment.text.split("\n");
    parts.forEach((part, index) => {
      if (part) {
        lines[lines.length - 1].push({ ...segment, text: part });
      }
      if (index < parts.length - 1) {
        lines.push([]);
      }
    });
  }

  return lines.map((lineSegments, index) => ({
    number: index + 1,
    segments: lineSegments
  }));
}
