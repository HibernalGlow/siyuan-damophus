import { afterEach, describe, expect, it } from "vitest";
import DockVisibilityPlugin from "./index";

afterEach(() => {
  document.getElementById("damophus-dock-visibility")?.remove();
  delete (window as { siyuan?: unknown }).siyuan;
});

describe("dock visibility plugin", () => {
  it("injects one stylesheet that hides buttons on the platforms they are pinned away from", () => {
    const module = new DockVisibilityPlugin();
    module.enabled = true;
    module.getSetting = (key) =>
      key === "dockPlatforms" ? { outline: "desktop", "damophus-custom": "mobile" } : undefined;

    module.onload();
    module.onload();

    const styles = document.querySelectorAll<HTMLStyleElement>("#damophus-dock-visibility");
    expect(styles).toHaveLength(1);
    const css = styles[0]!.textContent ?? "";
    expect(css).toContain('html[data-frontend="mobile"] .dock__item[data-type="outline"]');
    expect(css).toContain('html[data-frontend="browser-mobile"] .dock__item[data-type="outline"]');
    expect(css).toContain('html[data-frontend="desktop"] .dock__item[data-type="damophus-custom"]');

    module.onunload();
    expect(document.getElementById("damophus-dock-visibility")).toBeNull();
  });

  it("refreshes the stylesheet when the module data changes", () => {
    let platforms: Record<string, string> = {};
    const module = new DockVisibilityPlugin();
    module.enabled = true;
    module.getSetting = (key) => (key === "dockPlatforms" ? platforms : undefined);

    module.onload();
    const style = document.getElementById("damophus-dock-visibility");
    expect(style?.textContent).toBe("");

    platforms = { outline: "mobile" };
    module.onDataChanged();

    const css = document.getElementById("damophus-dock-visibility")?.textContent ?? "";
    expect(css).toContain('html[data-frontend="desktop"] .dock__item[data-type="outline"]');
    expect(css).not.toContain("damophus-custom");

    module.onunload();
  });
});
