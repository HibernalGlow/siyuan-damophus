import { describe, expect, it, vi } from "vitest";
import { copyMarkdown, selectedBlockIds } from "./interaction";

describe("Kramdown export interaction", () => {
  it("exports only top-level selected blocks", () => {
    const parent = document.createElement("div");
    parent.dataset.nodeId = "parent";
    const child = document.createElement("div");
    child.dataset.nodeId = "child";
    parent.append(child);
    const sibling = document.createElement("div");
    sibling.dataset.nodeId = "sibling";
    expect(selectedBlockIds([parent, child, sibling, parent])).toEqual(["parent", "sibling"]);
  });

  it("copies the final Markdown in one clipboard write", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    await copyMarkdown("# Export\n");
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith("# Export\n");
  });
});
