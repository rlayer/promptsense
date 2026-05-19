import { useMemo, useRef } from "react";
import { buildHighlightSegments } from "../analysis/spans";
import type { HighlightSpan } from "../types";

/** Props for the layered prompt editor and highlight overlay. */
interface PromptEditorProps {
  /** Current prompt text shown in the textarea. */
  prompt: string;

  /** Highlight ranges mapped onto the current prompt. */
  spans: HighlightSpan[];

  /** Called whenever the user edits the prompt text. */
  onChange(prompt: string): void;
}

/** Editable prompt surface with a synchronized read-only highlight layer. */
export function PromptEditor({ prompt, spans, onChange }: PromptEditorProps) {
  const highlightRef = useRef<HTMLPreElement | null>(null);
  const lineNumberRef = useRef<HTMLDivElement | null>(null);
  const segments = useMemo(() => buildHighlightSegments(prompt, spans), [prompt, spans]);
  const lineNumbers = useMemo(
    () => Array.from({ length: prompt.split("\n").length }, (_, index) => index + 1),
    [prompt]
  );

  return (
    <div className="editor-stack">
      <div className="editor-line-numbers" ref={lineNumberRef} aria-hidden="true">
        {lineNumbers.map((lineNumber) => (
          <span className="editor-line-number" key={lineNumber}>
            {lineNumber}
          </span>
        ))}
      </div>
      <pre className="highlight-layer" ref={highlightRef} aria-hidden="true">
        {segments.map((segment, index) =>
          segment.span ? (
            <mark
              key={`${segment.span.id}-${index}`}
              className={`highlight highlight-${segment.span.category} severity-${segment.span.severity}`}
              title={`${segment.span.category} · ${Math.round(
                segment.span.confidence * 100
              )}% confidence${segment.span.fuzzy ? " · fuzzy match" : ""}`}
            >
              {segment.text}
            </mark>
          ) : (
            <span key={`plain-${index}`}>{segment.text}</span>
          )
        )}
      </pre>
      <textarea
        aria-label="Prompt editor"
        className="prompt-textarea"
        value={prompt}
        wrap="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => {
          // Keep the highlight overlay aligned with the transparent textarea.
          if (highlightRef.current) {
            highlightRef.current.scrollTop = event.currentTarget.scrollTop;
            highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
          }
          if (lineNumberRef.current) {
            lineNumberRef.current.scrollTop = event.currentTarget.scrollTop;
          }
        }}
      />
    </div>
  );
}
