import { mount, tick, unmount } from "svelte";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import SlashMenuSettings from "./SlashMenuSettings.svelte";

let component: ReturnType<typeof mount> | undefined;
const labels = {
  description: "Configure each surface", mobile: "Mobile", desktop: "Desktop", enabled: "Enabled", visible: "Show", display: "Display",
  icon: "Icon available", full: "Full text", iconOnly: "Icon only", moveUp: "Move up", moveDown: "Move down",
  noIcon: "No icon; text required", empty: "No commands", refresh: "Reload commands",
};
const catalog = JSON.stringify([
  { id: "heading", label: "Heading", hasIcon: true }, { id: "paragraph", label: "Paragraph", hasIcon: false },
  { id: "list", label: "List", hasIcon: true },
]);

afterEach(async () => { if (component) await unmount(component); component = undefined; document.body.innerHTML = ""; });

function render(changed = vi.fn(), width = "1000px") {
  const target = document.createElement("div"); target.style.width = width; document.body.append(target);
  component = mount(SlashMenuSettings, { target, props: {
    title: "Responsive slash menu", mobileEnabled: true, desktopEnabled: false,
    mobileConfig: JSON.stringify([
      { id: "heading", visible: true, display: "icon" }, { id: "paragraph", visible: true, display: "full" },
      { id: "list", visible: false, display: "icon" },
    ]),
    desktopConfig: JSON.stringify([{ id: "list", visible: true, display: "full" }, { id: "heading", visible: true, display: "icon" }]),
    catalog, labels,
  }, events: { changed } });
  return { target, changed };
}

const itemIds = (surface: Element) => [...surface.querySelectorAll<HTMLElement>("[data-slash-item]")].map((row) => row.dataset.slashItem);

describe("slash menu settings", () => {
  it("offers an explicit command refresh action", async () => {
    const refresh = vi.fn();
    const target = document.createElement("div"); document.body.append(target);
    component = mount(SlashMenuSettings, { target, props: {
      title: "Responsive slash menu", mobileEnabled: true, desktopEnabled: false,
      mobileConfig: "[]", desktopConfig: "[]", catalog: "[]", labels,
    }, events: { refresh } });
    await tick();
    target.querySelector<HTMLButtonElement>(".slash-settings__refresh")?.click(); await tick();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("shows and edits mobile and desktop independently at the same time", async () => {
    const { target, changed } = render(); await tick();
    const mobile = target.querySelector<HTMLElement>("[data-slash-surface='mobile']")!;
    const desktop = target.querySelector<HTMLElement>("[data-slash-surface='desktop']")!;
    expect(mobile).not.toBeNull(); expect(desktop).not.toBeNull();
    expect(itemIds(mobile)).toEqual(["heading", "paragraph", "list"]);
    expect(itemIds(desktop)).toEqual(["list", "heading", "paragraph"]);

    mobile.querySelector<HTMLButtonElement>("[aria-label='Move down: Heading']")?.click(); await tick();
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ detail: expect.objectContaining({ key: "mobileMenuConfig" }) }));
    expect(JSON.parse(changed.mock.lastCall?.[0].detail.value).map((item: { id: string }) => item.id)).toEqual(["paragraph", "heading", "list"]);
    expect(itemIds(desktop)).toEqual(["list", "heading", "paragraph"]);

    desktop.querySelector<HTMLElement>("[role='switch'][aria-label='Enabled: Desktop']")?.click(); await tick();
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ detail: { key: "desktopEnabled", value: true } }));
  });

  it("forces text for no-icon commands and persists each surface visibility", async () => {
    const { target, changed } = render(); await tick();
    const mobileParagraph = target.querySelector<HTMLElement>("[data-slash-surface='mobile'] [data-slash-item='paragraph']")!;
    expect(mobileParagraph.querySelector(".slash-settings__forced")?.textContent).toBe(labels.full);
    expect(mobileParagraph.querySelector("[data-slot='select-trigger']")).toBeNull();
    mobileParagraph.querySelector<HTMLElement>("[role='switch']")?.click(); await tick();
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ detail: expect.objectContaining({ key: "mobileMenuConfig" }) }));
    expect(JSON.parse(changed.mock.lastCall?.[0].detail.value).find((item: { id: string }) => item.id === "paragraph").visible).toBe(false);
  });

  it("stacks both complete surface panels without horizontal overflow on narrow screens", async () => {
    await page.viewport(390, 760);
    const { target } = render(vi.fn(), "360px"); await tick();
    const mobile = target.querySelector<HTMLElement>("[data-slash-surface='mobile']")!;
    const desktop = target.querySelector<HTMLElement>("[data-slash-surface='desktop']")!;
    expect(desktop.getBoundingClientRect().top).toBeGreaterThan(mobile.getBoundingClientRect().bottom);
    expect(target.scrollWidth).toBeLessThanOrEqual(target.clientWidth);
  });
});
