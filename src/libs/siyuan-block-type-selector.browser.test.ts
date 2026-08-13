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
  target.className = "damophus-theme-root damophus-question-bank-theme";
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

  it("uses the active SiYuan theme for option surfaces and selection", async () => {
    const { target } = render(["NodeCodeBlock"]);
    target.style.setProperty("--b3-theme-background", "rgb(248, 250, 252)");
    target.style.setProperty("--b3-theme-on-background", "rgb(24, 31, 42)");
    target.style.setProperty("--b3-theme-surface", "rgb(236, 241, 246)");
    target.style.setProperty("--b3-theme-on-surface", "rgb(76, 87, 102)");
    target.style.setProperty("--b3-theme-primary", "rgb(19, 112, 87)");
    target.style.setProperty("--b3-theme-on-primary", "rgb(255, 255, 255)");
    target.style.setProperty("--b3-border-color", "rgb(172, 184, 197)");
    target.style.setProperty("--b3-list-hover", "rgb(220, 232, 228)");

    const paragraph = target.querySelector<HTMLElement>('[data-block-type="NodeParagraph"]')!;
    const code = target.querySelector<HTMLElement>('[data-block-type="NodeCodeBlock"]')!;
    await vi.waitFor(() => {
      expect(getComputedStyle(paragraph).backgroundColor).toBe("rgb(248, 250, 252)");
      expect(getComputedStyle(paragraph).borderColor).toBe("rgb(172, 184, 197)");
      expect(getComputedStyle(code).borderColor).toBe("rgb(19, 112, 87)");
    });

    target.style.setProperty("--b3-theme-background", "rgb(25, 28, 35)");
    target.style.setProperty("--b3-theme-on-background", "rgb(231, 235, 242)");
    target.style.setProperty("--b3-theme-primary", "rgb(126, 196, 172)");
    target.style.setProperty("--b3-border-color", "rgb(69, 78, 91)");
    await vi.waitFor(() => {
      expect(getComputedStyle(paragraph).backgroundColor).toBe("rgb(25, 28, 35)");
      expect(getComputedStyle(paragraph).color).toBe("rgb(231, 235, 242)");
      expect(getComputedStyle(code).borderColor).toBe("rgb(126, 196, 172)");
    });
  });
});
