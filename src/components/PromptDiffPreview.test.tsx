import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { extractChangedExcerpts } from "../analysis/diff";
import { PromptDiffPreview } from "./PromptDiffPreview";

describe("PromptDiffPreview", () => {
  it("keeps checkpoint and current prompt panes scrolled together", () => {
    const baseline = `# Grounding
Use only provided documents.

# Calculation Rules
Preserve the original currency and units.`;
    const current = `# Grounding
Use only provided documents.
Do not hallucinate.

# Calculation Rules
Preserve the original currency.`;

    render(
      <PromptDiffPreview
        baselinePrompt={baseline}
        currentPrompt={current}
        changedExcerpts={extractChangedExcerpts(baseline, current)}
        changedSectionLabel="2 changed sections"
      />
    );

    const checkpointPane = screen.getByLabelText("Checkpoint diff text");
    const currentPane = screen.getByLabelText("Current prompt diff text");

    checkpointPane.scrollTop = 120;
    checkpointPane.scrollLeft = 16;
    fireEvent.scroll(checkpointPane);

    expect(currentPane.scrollTop).toBe(120);
    expect(currentPane.scrollLeft).toBe(16);

    currentPane.scrollTop = 48;
    currentPane.scrollLeft = 0;
    fireEvent.scroll(currentPane);

    expect(checkpointPane.scrollTop).toBe(48);
    expect(checkpointPane.scrollLeft).toBe(0);
  });
});
