import { describe, expect, it } from "vitest";
import { extractChangedExcerpts } from "./diff";

describe("extractChangedExcerpts", () => {
  it("returns no excerpts for matching prompts", () => {
    expect(extractChangedExcerpts("same", "same")).toEqual([]);
  });

  it("extracts changed text with current prompt range", () => {
    const [excerpt] = extractChangedExcerpts("Return JSON with priority.", "Return JSON with severity.");

    expect(excerpt.kind).toBe("changed");
    expect(excerpt.before).toContain("priority");
    expect(excerpt.after).toContain("severity");
    expect(excerpt.baselineStart).toBe("Return JSON with priority.".indexOf("priority"));
    expect(excerpt.baselineEnd).toBe("Return JSON with priority.".indexOf("priority") + "priority".length);
    expect(excerpt.start).toBe("Return JSON with severity.".indexOf("severity"));
    expect(excerpt.end).toBe("Return JSON with severity.".indexOf("severity") + "severity".length);
  });

  it("detects additions", () => {
    const [excerpt] = extractChangedExcerpts("Return JSON.", "Return JSON with severity.");

    expect(excerpt.kind).toBe("added");
    expect(excerpt.after).toContain("with severity");
  });

  it("extracts independent edits as separate hunks", () => {
    const unchangedBlock = [
      "# Output",
      "Return JSON with summary, category, and priority.",
      "Downstream systems parse the JSON keys exactly.",
      "Run parser snapshots before changing the output contract."
    ].join("\n");
    const excerpts = extractChangedExcerpts(
      `# Role
Be formal.

${unchangedBlock}

# Safety
Refuse secrets.`,
      `# Role
Be concise.

${unchangedBlock}

# Safety
Refuse private data.`
    );

    expect(excerpts).toHaveLength(2);
    expect(excerpts.map((excerpt) => excerpt.after)).toEqual(["concise", "private data"]);
  });

  it("classifies additions and removals in separate hunks", () => {
    const unchangedBlock = [
      "Keep the original output shape.",
      "Validate examples against downstream parsers.",
      "Exercise fixture coverage for account access, billing, refunds, and escalation paths.",
      "Run regression prompts before release."
    ].join("\n");
    const excerpts = extractChangedExcerpts(
      `# Role
You triage tickets.

# Deprecated
Remove the legacy priority alias.

${unchangedBlock}`,
      `# Role
You triage tickets.

${unchangedBlock}

# Checks
Add schema snapshot coverage.`
    );

    expect(excerpts.map((excerpt) => excerpt.kind)).toEqual(["removed", "added"]);
    expect(excerpts[0].before).toContain("legacy priority alias");
    expect(excerpts[1].after).toContain("schema snapshot coverage");
    expect(excerpts[0].start).toBe(excerpts[0].end);
  });

  it("does not merge nearby additions and removals into a replacement", () => {
    const baseline = `# Output
- summary
- category
- priority

# Parser Contract
Downstream systems parse the JSON keys exactly.`;
    const current = `# Output
- summary
- severity
- category

# Parser Contract
Downstream systems parse the JSON keys exactly.`;
    const excerpts = extractChangedExcerpts(baseline, current);

    expect(excerpts.map((excerpt) => excerpt.kind)).toEqual(["added", "removed"]);
    expect(excerpts[0].after).toContain("severity");
    expect(excerpts[0].before).toBe("");
    expect(excerpts[1].before).toContain("priority");
    expect(excerpts[1].after).toBe("");
  });

  it("merges nearby edits into one hunk", () => {
    const excerpts = extractChangedExcerpts(
      `Alpha one.
Middle short.
Beta one.`,
      `Alpha two.
Middle short.
Beta two.`
    );

    expect(excerpts).toHaveLength(1);
    expect(excerpts[0].before).toContain("one");
    expect(excerpts[0].before).toContain("Middle short");
    expect(excerpts[0].before).toContain("Beta one");
    expect(excerpts[0].after).toContain("two");
    expect(excerpts[0].after).toContain("Middle short");
    expect(excerpts[0].after).toContain("Beta two");
  });
});
