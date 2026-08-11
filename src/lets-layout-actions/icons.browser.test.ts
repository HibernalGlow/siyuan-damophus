import { afterEach, describe, expect, it } from "vitest";
import { PANEL_LAYOUT_ICONS, PANEL_LAYOUT_ICON_SYMBOLS } from "./icons";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("panel layout action icons", () => {
  it("renders the Codex-style left sidebar collapse geometry at Dock size", () => {
    const sprite = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    sprite.innerHTML = `<defs>${PANEL_LAYOUT_ICON_SYMBOLS}</defs>`;
    sprite.style.position = "absolute";
    sprite.style.width = "0";
    sprite.style.height = "0";

    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("width", "24");
    icon.setAttribute("height", "24");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#${PANEL_LAYOUT_ICONS.switchLeftDock}`);
    icon.append(use);
    document.body.append(sprite, icon);

    const box = use.getBBox();
    expect([box.x, box.y, box.width, box.height]).toEqual([3, 3, 18, 18]);
    expect(sprite.querySelector(`#${PANEL_LAYOUT_ICONS.switchLeftDock} path:last-child`)?.getAttribute("d"))
      .toBe("m16 15-3-3 3-3");
  });
});
