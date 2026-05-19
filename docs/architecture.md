# Architecture

PromptSense is a frontend-only React app for comparing a prompt against a
checkpoint and asking a selected model what the edit may affect. It does not run
a backend or proxy. Provider API keys are entered by the user and sent directly
from the browser to the selected provider.

## Data Flow

1. `App.tsx` keeps the current prompt, checkpoint prompt, provider settings, and
   analysis status in local React state.
2. `src/analysis/diff.ts` compares the checkpoint prompt with the current prompt
   and emits `ChangedExcerpt` ranges. The diff is always checkpoint-relative.
3. `PromptDiffPreview` renders the checkpoint and current prompt side by side.
   It stays mounted even when there are no changes, so typing does not shift the
   workspace layout. The two diff panes scroll together.
4. When there is a non-empty prompt, a checkpoint, and at least one changed
   excerpt, `App.tsx` debounces a provider analysis request.
5. The request sends the current prompt plus compact changed excerpts. The full
   checkpoint prompt is used locally but is not sent on every live request.
6. The provider returns structured impact JSON when possible.
7. `src/analysis/spans.ts` maps returned phrases back onto the current prompt
   using exact matching first, then fuzzy matching with reduced confidence.
8. The prompt editor renders those mapped spans in its highlight overlay, while
   `InsightsPanel` renders summary, insight cards, checks, and the impact score.

## Provider Contract

Each provider implements `ProviderAdapter` from `src/types.ts`.

Provider-specific code should only handle:

- model options
- request headers and body shape
- response text extraction
- provider error messages

Shared retry and fallback behavior lives in `src/providers/analysisFlow.ts`.

## Checkpoints

The checkpoint prompt is the baseline for every diff and analysis. Creating a
checkpoint copies the current prompt into `checkpointPrompt` and resets existing
analysis. Resetting copies `checkpointPrompt` back into the editor.

The `Clear` action clears both `prompt` and `checkpointPrompt`, labels the
checkpoint as `No checkpoint`, and resets analysis/highlights. The diff preview
remains mounted, but both panes become empty.

## Local Diffing

`src/analysis/diff.ts` works at line level first, using the shared LCS helper in
`src/analysis/lcs.ts`. It then trims shared prefixes/suffixes inside each hunk
and expands non-empty changed ranges to token boundaries. Nearby hunks of the
same kind may be merged for readability, but additions and removals are kept
separate so independent edits do not look like a replacement.

`src/analysis/visualDiff.ts` builds the full side-by-side diff display from the
checkpoint prompt, current prompt, and changed excerpts. The rendered text in
each pane always reconstructs its source prompt.

## JSON Recovery

Model JSON can be imperfect, especially in direct browser calls. PromptSense
repairs common formatting problems, but it does not display incomplete recovered
objects as if they were complete analysis. Incomplete structured output triggers
a stricter retry, then a plain-text fallback.

Plain-text fallback still preserves the full provider analysis in the summary
area. Because plain prose does not carry reliable exact phrase ranges, fallback
highlight and insight data is derived conservatively from the local diff:

- current-side changed text becomes fallback `changedPhrases`
- removed checkpoint text points to nearby current prompt context
- plain-text `Side effects` and `Checks` sections are converted into fallback
  insight cards and recommended checks when possible

## Highlighting

The prompt editor is a real `textarea` layered over a synchronized `pre`. Native
textareas cannot style individual phrases, so the overlay renders highlights
while the textarea remains responsible for editing, selection, and keyboard
behavior.

Structured provider output is the preferred source of highlights and insights.
Fallback-derived highlights are intentionally lower confidence because they come
from local diff context rather than model-provided phrase ranges.
