import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("runs demo analysis after editing against a manual checkpoint", async () => {
    const { container } = render(<App />);

    const editor = screen.getByLabelText("Prompt editor");
    fireEvent.change(editor, {
      target: {
        value: `${(editor as HTMLTextAreaElement).value}\n- strict_json_version`
      }
    });

    await waitFor(
      () => {
        expect(screen.getByText(/contract-like part|localized impact/i)).toBeInTheDocument();
      },
      { timeout: 2500 }
    );
    expect(screen.getByLabelText("Impact insights")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Total impact score")).getByText(/%$/)).toBeInTheDocument();
    const promptLegend = screen.getByLabelText("Prompt highlights legend");
    expect(promptLegend).toBeInTheDocument();
    const changedLegendItem = within(promptLegend).getByLabelText(
      "Changed: Text that was edited since the checkpoint."
    );
    expect(changedLegendItem).toHaveAttribute(
      "title",
      "Text that was edited since the checkpoint."
    );
    expect(changedLegendItem).not.toHaveAttribute("data-tooltip");
    expect(changedLegendItem.querySelector(".legend-info-icon")).toBeNull();
    expect(screen.getByLabelText("Impact insights").querySelector(".legend")).toBeNull();
    expect(container.querySelector(".editor-panel .panel-heading .legend-item")).toBeInTheDocument();
  });

  it("lets the user create a checkpoint", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Create checkpoint" }));

    expect(screen.getByText("Manual checkpoint")).toBeInTheDocument();
  });

  it("clears the editable prompt and checkpoint comparison", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.getByLabelText("Prompt editor")).toHaveValue("");
    expect(screen.getByText("No checkpoint")).toBeInTheDocument();
    expect(screen.getByText("Prompt empty")).toBeInTheDocument();
    expect(screen.getByLabelText("Full prompt comparison")).toBeInTheDocument();
    expect(screen.getByLabelText("Checkpoint diff text")).toHaveTextContent("1");
    expect(screen.getByLabelText("Current prompt diff text")).toHaveTextContent("1");
    await waitFor(
      () => {
        expect(screen.queryByLabelText("Total impact score")).not.toBeInTheDocument();
      },
      { timeout: 1000 }
    );
  });

  it("keeps the checkpoint comparison mounted while edits appear", () => {
    render(<App />);

    const comparison = screen.getByLabelText("Full prompt comparison");
    expect(screen.queryByRole("button", { name: "Clear prompt" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create checkpoint" }));

    expect(screen.getByLabelText("Full prompt comparison")).toBe(comparison);
    expect(screen.getAllByText("No changes").length).toBeGreaterThan(0);

    const editor = screen.getByLabelText("Prompt editor") as HTMLTextAreaElement;
    fireEvent.change(editor, {
      target: {
        value: `${editor.value}\n- strict_json_version`
      }
    });

    expect(screen.getByLabelText("Full prompt comparison")).toBe(comparison);
    expect(screen.getAllByText("1 changed section").length).toBeGreaterThan(0);
  });

  it("clears stale highlights immediately when the prompt changes", async () => {
    const { container } = render(<App />);

    const editor = screen.getByLabelText("Prompt editor") as HTMLTextAreaElement;
    fireEvent.change(editor, {
      target: {
        value: `${editor.value}\n- strict_json_version`
      }
    });

    await waitFor(
      () => {
        expect(screen.getByLabelText("Total impact score")).toBeInTheDocument();
      },
      { timeout: 2500 }
    );
    expect(container.querySelector(".highlight")).toBeInTheDocument();

    fireEvent.change(editor, {
      target: {
        value: `${editor.value}\n- another edit`
      }
    });

    expect(screen.queryByLabelText("Total impact score")).not.toBeInTheDocument();
    expect(container.querySelector(".highlight")).not.toBeInTheDocument();
  });

  it("shows a full before-and-after comparison for multiple independent edits", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Create checkpoint" }));

    const editor = screen.getByLabelText("Prompt editor") as HTMLTextAreaElement;
    fireEvent.change(editor, {
      target: {
        value: editor.value
          .replace("support triage assistant", "support routing assistant")
          .replace('"priority":"high"', '"priority":"urgent"')
      }
    });

    expect(screen.getAllByText("2 changed sections").length).toBeGreaterThan(0);
    const comparison = screen.getByLabelText("Full prompt comparison");
    expect(within(comparison).getAllByText("Checkpoint").length).toBeGreaterThan(0);
    expect(within(comparison).getByText("Current prompt")).toBeInTheDocument();
    expect(within(comparison).getByText("triage")).toBeInTheDocument();
    expect(within(comparison).getByText("routing")).toBeInTheDocument();
    expect(within(comparison).getByText("urgent")).toBeInTheDocument();
    expect(comparison.querySelector(".diff-line-number")).toHaveTextContent("1");
    expect(comparison.querySelectorAll(".diff-line-number").length).toBeGreaterThan(2);
  });

  it("uses the remembered provider as the browser-session default", () => {
    sessionStorage.setItem("promptsense.apiKey.gemini", "stored-key");
    sessionStorage.setItem("promptsense.defaultProvider", "gemini");

    render(<App />);

    expect(screen.getByLabelText("Provider")).toHaveValue("gemini");
    expect(screen.getByLabelText("API key")).toHaveValue("stored-key");
    expect(screen.getByRole("checkbox", { name: /remember/i })).toBeChecked();
  });

  it("saves the provider as the session default when remembering the key", async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "gemini" } });
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "new-key" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /remember/i }));

    await waitFor(() => {
      expect(sessionStorage.getItem("promptsense.defaultProvider")).toBe("gemini");
    });
    expect(sessionStorage.getItem("promptsense.apiKey.gemini")).toBe("new-key");
  });
});
