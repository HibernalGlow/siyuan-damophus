import { afterEach, describe, expect, it } from "vitest";
import {
  MOBILE_LIQUID_GLASS_STYLE_ID,
  MobileLiquidGlass,
} from "./liquid-glass";

afterEach(() => {
  delete document.documentElement.dataset.frontend;
  document.getElementById(MOBILE_LIQUID_GLASS_STYLE_ID)?.remove();
});

describe("mobile liquid glass", () => {
  it("mounts one unified CSS glass surface without a global SVG filter", () => {
    document.documentElement.dataset.frontend = "browser-mobile";
    const liquidGlass = new MobileLiquidGlass(document);

    expect(liquidGlass.mount()).toBe(true);
    expect(liquidGlass.mount()).toBe(true);
    expect(document.querySelectorAll(`#${MOBILE_LIQUID_GLASS_STYLE_ID}`)).toHaveLength(1);
    const css = document.getElementById(MOBILE_LIQUID_GLASS_STYLE_ID)?.textContent ?? "";
    expect(css).toContain(`#editor::before`);
    expect(css).toContain(`backdrop-filter: blur(5px) saturate(1.24) contrast(1.03)`);
    expect(css).not.toContain(`backdrop-filter: url(`);
    expect(css)
      .toContain(`body:has(> #sidebar[style*="translateX(0px)"]) #editor::before`);
    expect(css).not.toContain(`#editor::after`);
    expect(document.querySelectorAll("#damophus-mobile-liquid-glass-host")).toHaveLength(0);
  });

  it("waits for the mobile frontend and removes every injected node", async () => {
    document.documentElement.dataset.frontend = "desktop";
    const liquidGlass = new MobileLiquidGlass(document);

    liquidGlass.start();
    expect(document.getElementById(MOBILE_LIQUID_GLASS_STYLE_ID)).toBeNull();

    document.documentElement.dataset.frontend = "mobile";
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(document.getElementById(MOBILE_LIQUID_GLASS_STYLE_ID)).not.toBeNull();
    liquidGlass.destroy();
    expect(document.getElementById(MOBILE_LIQUID_GLASS_STYLE_ID)).toBeNull();
  });
});
