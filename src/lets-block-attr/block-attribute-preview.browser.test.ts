import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import BlockAttributePreview from "./BlockAttributePreview.svelte";

let mounted: ReturnType<typeof mount>[] = [];

afterEach(async () => {
  await Promise.all(mounted.map((component) => unmount(component)));
  mounted = [];
  document.body.innerHTML = "";
});

function render(props: Record<string, unknown>): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  mounted.push(mount(BlockAttributePreview, { target: container, props }));
  return container;
}

describe("block attribute settings preview", () => {
  it("previews the horizontal marker and lets the user inspect a narrow width", async () => {
    const container = render({
      customProperties: "custom-qb-id|qb-id\ncustom-qb-type|qb-type",
      customStyle: "border-radius: 10px;",
      title: "Marker preview",
      widthLabel: "Preview width",
    });
    const sample = container.querySelector<HTMLElement>(
      ".damophus-block-attr-preview__sample",
    );
    const viewport = container.querySelector<HTMLElement>(".preview-viewport");
    const width = container.querySelector<HTMLElement>('[role="slider"]');
    if (!sample || !viewport || !width) throw new Error("Missing marker preview");
    await tick();

    const marker = getComputedStyle(sample, "::after");
    expect(marker.content).toContain("qb-id");
    expect(marker.content).toContain("civil-procedure-gold-2021-2-4-15");
    expect(marker.whiteSpace).toBe("normal");
    expect(marker.borderRadius).toBe("10px");

    width.focus();
    width.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    width.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    width.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await tick();
    expect(viewport.getAttribute("style")).toContain("220px");
  });

  it("previews a value without its label and cannot reveal the answer attribute", async () => {
    const container = render({
      customProperties: "custom-qb-id\ncustom-qb-answer|answer",
      customStyle: "content: attr(custom-qb-answer); color: rgb(1, 2, 3);",
      title: "Marker preview",
      widthLabel: "Preview width",
    });
    const sample = container.querySelector<HTMLElement>(
      ".damophus-block-attr-preview__sample",
    );
    if (!sample) throw new Error("Missing marker preview");
    await tick();

    const marker = getComputedStyle(sample, "::after");
    expect(marker.content).toContain("civil-procedure-gold-2021-2-4-15");
    expect(marker.content).not.toContain("qb-id");
    expect(marker.content).not.toContain("answer");
    expect(marker.color).toBe("rgb(1, 2, 3)");
  });
});
