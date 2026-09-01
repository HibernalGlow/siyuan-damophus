import { mount, tick, unmount } from "svelte";
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Menu } from "siyuan";
import DockVisibilitySettings from "./DockVisibilitySettings.svelte";
import type { DockItemInfo } from "./dock-items";

const labels = {
  settingsTitle: "Dock visibility",
  showOn: "Show on",
  platformDesktop: "Desktop only",
  platformMobile: "Mobile only",
  platformBoth: "Both platforms",
  positionLeft: "Left dock",
  positionRight: "Right dock",
  positionBottom: "Bottom dock",
};

const items: DockItemInfo[] = [
  { type: "outline", label: "大纲", position: "Left" },
  { type: "backlink", label: "反向链接", position: "Right" },
];

let component: ReturnType<typeof mount> | undefined;
let addItemSpy: ReturnType<typeof vi.spyOn> | undefined;

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  addItemSpy?.mockRestore();
  addItemSpy = undefined;
  document.body.innerHTML = "";
});

function render(props: Record<string, unknown> = {}, changed?: (event: CustomEvent) => void) {
  const target = document.createElement("div");
  target.className = "damophus-theme-root damophus-question-bank-theme";
  document.body.append(target);
  component = mount(DockVisibilitySettings, {
    target,
    props: { group: "dockVisibility", title: labels.settingsTitle, items, platforms: {}, labels, ...props },
    events: changed ? { changed } : undefined,
  });
  return target;
}

function rowButton(label: string) {
  return document.querySelector<HTMLButtonElement>(`button[aria-label="Show on: ${label}"]`)!;
}

describe("dock visibility settings", () => {
  it("groups dock buttons by position with a platform control per row", async () => {
    const target = render({ platforms: { outline: "desktop" } });
    await tick();

    expect(target.textContent).toContain(labels.settingsTitle);
    expect(target.textContent).toContain(labels.positionLeft);
    expect(target.textContent).toContain(labels.positionRight);
    const rows = [...target.querySelectorAll("button[aria-label^='Show on:']")];
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "Show on: 大纲",
      "Show on: 反向链接",
    ]);
  });

  it("offers three platforms in a menu and reports the pick", async () => {
    const changed = vi.fn();
    render({ platforms: { outline: "both" } }, changed);
    await tick();

    addItemSpy = vi.spyOn(Menu.prototype, "addItem");
    await userEvent.click(rowButton("大纲"));

    expect(addItemSpy).toHaveBeenCalledTimes(3);
    expect(addItemSpy.mock.calls.map(([options]) => (options as { label: string }).label)).toEqual([
      "Desktop only",
      "Mobile only",
      "Both platforms",
    ]);
    expect(addItemSpy.mock.calls.map(([options]) => (options as { current: boolean }).current)).toEqual([
      false,
      false,
      true,
    ]);

    const mobileOption = addItemSpy.mock.calls[1][0] as { click: () => void };
    mobileOption.click();

    expect(changed).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          group: "dockVisibility",
          key: "dockPlatforms",
          value: { outline: "mobile" },
        },
      }),
    );
  });
});
