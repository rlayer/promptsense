import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PromptEditor } from "./PromptEditor";

describe("PromptEditor", () => {
  it("renders line numbers for each prompt line", () => {
    const { container } = render(
      <PromptEditor prompt={"line one\nline two\nline three"} spans={[]} onChange={vi.fn()} />
    );

    const lineNumbers = Array.from(container.querySelectorAll(".editor-line-number")).map(
      (node) => node.textContent
    );

    expect(lineNumbers).toEqual(["1", "2", "3"]);
  });
});
