import { afterEach, describe, expect, it } from "vitest";
import { tick } from "svelte";
import { mount, unmount } from "svelte";
import LiveStylePreview from "./live-style-preview.svelte";

const mounted: Record<string, unknown>[] = [];
afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.innerHTML = "";
});

describe("LiveStylePreview", () => {
  it("provides one shared accessible and pinnable preview surface", async () => {
    mounted.push(mount(LiveStylePreview, { target: document.body, props: {
      title: "Preview",
      description: "Updates live",
      ariaLabel: "Style preview",
      pinLabel: "Pin preview",
      unpinLabel: "Unpin preview",
    } }));
    const root = document.querySelector<HTMLElement>("[data-live-style-preview]")!;
    const surface = root.querySelector<HTMLElement>(".damophus-live-style-preview__surface")!;
    const pin = root.querySelector<HTMLButtonElement>('[aria-label="Unpin preview"]')!;
    expect(root.getAttribute("aria-label")).toBe("Style preview");
    expect(root.dataset.pinned).toBe("true");
    expect(getComputedStyle(root).position).toBe("sticky");
    expect(root.textContent).toContain("Updates live");
    expect(getComputedStyle(surface).borderRadius).toBe("6px");

    pin.click();
    await tick();
    expect(root.dataset.pinned).toBe("false");
    expect(getComputedStyle(root).position).not.toBe("sticky");
    expect(root.querySelector('[aria-label="Pin preview"]')).not.toBeNull();
  });
});
