import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, unmount } from "svelte";
import { page } from "vitest/browser";
import SiyuanBlockTypeSelector from "./SiyuanBlockTypeSelector.svelte";

const mounted: Record<string, unknown>[] = [];

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.innerHTML = "";
});

function render(value: unknown = "NodeCodeBlock") {
  const changed = vi.fn();
  const target = document.createElement("div");
  target.style.width = "760px";
  document.body.append(target);
  mounted.push(mount(SiyuanBlockTypeSelector, {
    target,
    props: { value, labels: { "settings.blockType.paragraph": "Paragraph", "settings.blockType.codeBlock": "Code block" } },
    events: { value: changed },
  }));
  return { target, changed };
}

describe("SiYuan block type selector", () => {
  it("reads legacy text and emits a normalized array when toggled", async () => {
    const { changed } = render("NodeCodeBlock");
    const code = page.getByRole("button", { name: "Code block (NodeCodeBlock)" });
    const paragraph = page.getByRole("button", { name: "Paragraph (NodeParagraph)" });
    await expect.element(code).toHaveAttribute("aria-pressed", "true");
    await paragraph.click();
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({
      detail: ["NodeParagraph", "NodeCodeBlock"],
    }));
  });

  it("filters by friendly label or Node value and supports clearing", async () => {
    const { target, changed } = render(["NodeParagraph", "NodeCodeBlock"]);
    await page.getByRole("searchbox", { name: "Search block types" }).fill("CodeBlock");
    expect(target.querySelectorAll("[data-block-type]")).toHaveLength(1);
    await page.getByRole("button", { name: "Clear" }).click();
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ detail: [] }));
  });

  it("stays within a narrow settings panel", async () => {
    await page.viewport(390, 760);
    const { target } = render(["NodeCodeBlock"]);
    target.style.width = "340px";
    await vi.waitFor(() => expect(target.scrollWidth).toBeLessThanOrEqual(target.clientWidth));
    const selector = target.querySelector<HTMLElement>('[data-testid="block-type-selector"]');
    expect(selector?.getBoundingClientRect().width).toBeLessThanOrEqual(target.getBoundingClientRect().width);
  });
});
