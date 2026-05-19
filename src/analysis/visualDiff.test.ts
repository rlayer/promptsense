import { describe, expect, it } from "vitest";
import { extractChangedExcerpts } from "./diff";
import { buildSideBySideDiff } from "./visualDiff";

describe("buildSideBySideDiff", () => {
  it("keeps full text and marks changed tokens on both sides", () => {
    const baseline = `# Role
Be formal.

# Output
Return JSON.`;
    const current = `# Role
Be concise.

# Output
Return JSON.`;
    const diff = buildSideBySideDiff(baseline, current, extractChangedExcerpts(baseline, current));

    expect(diff.before.map((segment) => segment.text).join("")).toBe(baseline);
    expect(diff.after.map((segment) => segment.text).join("")).toBe(current);
    expect(diff.before).toContainEqual({ text: "formal", kind: "removed" });
    expect(diff.after).toContainEqual({ text: "concise", kind: "added" });
  });

  it("marks additions and removals without truncating either prompt", () => {
    const baseline = `# Role
You triage tickets.

# Deprecated
Remove the legacy priority alias.`;
    const current = `# Role
You triage tickets.

# Checks
Add schema snapshot coverage.`;
    const diff = buildSideBySideDiff(baseline, current, extractChangedExcerpts(baseline, current));

    expect(diff.before.map((segment) => segment.text).join("")).toBe(baseline);
    expect(diff.after.map((segment) => segment.text).join("")).toBe(current);
    expect(diff.before.some((segment) => segment.kind === "removed")).toBe(true);
    expect(diff.after.some((segment) => segment.kind === "added")).toBe(true);
  });
});
