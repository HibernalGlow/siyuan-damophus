import { mount, tick, unmount } from "svelte";
import { SOURCES, TRIGGERS } from "svelte-dnd-action";
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
  { id: "heading", label: "Heading", hasIcon: true, iconId: "iconHeading1" }, { id: "paragraph", label: "Paragraph", hasIcon: false },
  { id: "list", label: "List", hasIcon: true, iconId: "iconList" }, { id: "quote", label: "Quote", hasIcon: true, iconText: "❝" },
  { id: "code", label: "Code", hasIcon: true, iconId: "iconCode" },
]);
const mobileConfig = [
  { id: "heading", visible: true, display: "icon" as const }, { id: "paragraph", visible: true, display: "full" as const },
  { id: "list", visible: false, display: "icon" as const }, { id: "quote", visible: true, display: "full" as const },
  { id: "code", visible: true, display: "icon" as const },
];
const desktopConfig = [
  { id: "list", visible: true, display: "full" as const }, { id: "heading", visible: true, display: "icon" as const },
];

afterEach(async () => { if (component) await unmount(component); component = undefined; document.body.innerHTML = ""; });

function render(changed = vi.fn(), width = "1000px", refresh = vi.fn()) {
  const target = document.createElement("div"); target.style.width = width; document.body.append(target);
  component = mount(SlashMenuSettings, { target, props: {
    title: "Responsive slash menu", mobileEnabled: true, desktopEnabled: false,
    mobileConfig: JSON.stringify(mobileConfig), desktopConfig: JSON.stringify(desktopConfig), catalog, labels,
  }, events: { changed, refresh } });
  return { target, changed, refresh };
}

const itemIds = (target: Element) => [...target.querySelectorAll<HTMLElement>("[data-slash-item]")].map((row) => row.dataset.slashItem);

describe("slash menu settings", () => {
  it("switches between independent mobile and desktop tabs", async () => {
    const { target, changed } = render(); await tick();
    expect(target.querySelectorAll("[data-slash-surface]")).toHaveLength(1);
    expect(target.querySelector("[data-slash-surface='mobile']")).not.toBeNull();
    expect(itemIds(target)).toEqual(["heading", "paragraph", "list", "quote", "code"]);

    target.querySelector<HTMLButtonElement>("[role='tab'][aria-selected='false']")?.click(); await tick();
    expect(target.querySelector("[data-slash-surface='desktop']")).not.toBeNull();
    expect(itemIds(target)).toEqual(["list", "heading", "paragraph", "quote", "code"]);
    target.querySelector<HTMLElement>("[role='switch'][aria-label='Enabled: Desktop']")?.click(); await tick();
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ detail: { key: "desktopEnabled", value: true } }));
  });

  it("uses an inline icon button for display mode and fixes text-only commands", async () => {
    const { target, changed } = render(); await tick();
    const heading = target.querySelector<HTMLElement>("[data-slash-item='heading']")!;
    const displayToggle = heading.querySelector<HTMLButtonElement>(".slash-settings__display-toggle")!;
    expect(displayToggle.getAttribute("aria-label")).toBe("Display: Heading; Icon only");
    expect(displayToggle.closest(".slash-settings__card-header")).not.toBeNull();
    expect(displayToggle.querySelector("use")?.getAttribute("href")).toBe("#iconHeading1");
    expect(displayToggle.classList.contains("active")).toBe(true);
    expect(heading.querySelector(".slash-settings__icon")).toBeNull();
    displayToggle.click(); await tick();
    expect(displayToggle.querySelector("use")?.getAttribute("href")).toBe("#iconHeading1");
    expect(displayToggle.classList.contains("active")).toBe(false);
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ detail: expect.objectContaining({ key: "mobileMenuConfig" }) }));
    expect(JSON.parse(changed.mock.lastCall?.[0].detail.value).find((item: { id: string }) => item.id === "heading").display).toBe("full");

    const paragraph = target.querySelector<HTMLElement>("[data-slash-item='paragraph']")!;
    expect(paragraph.querySelector("button.slash-settings__display-toggle")).toBeNull();
    expect(paragraph.querySelector(".slash-settings__display-toggle--fixed")?.getAttribute("aria-label")).toBe("Display: Paragraph; Full text");
  });

  it("persists DND card order instead of using arrow controls", async () => {
    const { target, changed } = render(); await tick();
    expect(target.querySelector("[aria-label^='Move up']")).toBeNull();
    expect(target.querySelector("[aria-label^='Move down']")).toBeNull();
    const zone = target.querySelector<HTMLElement>("[data-slash-menu-dnd]")!;
    zone.dispatchEvent(new CustomEvent("finalize", { detail: {
      items: [mobileConfig[2], mobileConfig[0], mobileConfig[1], mobileConfig[3], mobileConfig[4]],
      info: { id: "list", source: SOURCES.POINTER, trigger: TRIGGERS.DROPPED_INTO_ZONE },
    } }));
    await tick();
    expect(itemIds(target)).toEqual(["list", "heading", "paragraph", "quote", "code"]);
    expect(JSON.parse(changed.mock.lastCall?.[0].detail.value).map((item: { id: string }) => item.id))
      .toEqual(["list", "heading", "paragraph", "quote", "code"]);
  });

  it("adapts the number of card columns to available width", async () => {
    await page.viewport(1200, 800);
    const { target } = render(vi.fn(), "960px"); await tick();
    const cards = [...target.querySelectorAll<HTMLElement>("[data-slash-item]")];
    const wideFirstRow = cards.filter((card) => Math.abs(card.getBoundingClientRect().top - cards[0].getBoundingClientRect().top) < 2).length;
    expect(wideFirstRow).toBeGreaterThanOrEqual(3);

    target.style.width = "280px"; await tick(); await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    const narrowCards = [...target.querySelectorAll<HTMLElement>("[data-slash-item]")];
    const narrowFirstRow = narrowCards.filter((card) => Math.abs(card.getBoundingClientRect().top - narrowCards[0].getBoundingClientRect().top) < 2).length;
    expect(narrowFirstRow).toBe(1);
    expect(target.scrollWidth).toBeLessThanOrEqual(target.clientWidth);
  });

  it("offers an explicit command refresh action", async () => {
    const { target, refresh } = render(); await tick();
    target.querySelector<HTMLButtonElement>(".slash-settings__refresh")?.click(); await tick();
    expect(refresh).toHaveBeenCalledOnce();
  });
});
