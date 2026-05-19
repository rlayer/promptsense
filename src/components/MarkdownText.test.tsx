import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownText } from "./MarkdownText";

describe("MarkdownText", () => {
  it("formats plain fallback section titles", () => {
    render(
      <MarkdownText
        text={`Summary
Two changes were made.

Direct impact
The edit changes the model behavior.`}
      />
    );

    expect(screen.getByRole("heading", { name: "Summary" }).tagName).toBe("H3");
    expect(screen.getByRole("heading", { name: "Direct impact" }).tagName).toBe("H3");
    expect(screen.getByText("Two changes were made.").tagName).toBe("P");
  });

  it("formats bold inline markdown", () => {
    render(<MarkdownText text="Summary: **Reduced Safety Scope:** API keys are affected." />);

    expect(screen.getByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(screen.getByText("Reduced Safety Scope:").tagName).toBe("STRONG");
    expect(screen.queryByText(/\*\*Reduced Safety Scope:\*\*/)).not.toBeInTheDocument();
  });

  it("formats ordered lists with bold text", () => {
    render(
      <MarkdownText
        text={`Side effects:
1. **Reduced Safety Scope:** API keys may be revealed.
2. **Potential Vulnerability:** Sensitive data handling is weaker.`}
      />
    );

    expect(screen.getByRole("heading", { name: "Side effects" })).toBeInTheDocument();
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("Potential Vulnerability:").tagName).toBe("STRONG");
  });
});
