import { afterEach, describe, expect, it } from "vitest";
import {
  MOBILE_LIQUID_GLASS_FILTER_ID,
  MOBILE_LIQUID_GLASS_HOST_ID,
  MOBILE_LIQUID_GLASS_STYLE_ID,
  MobileLiquidGlass,
} from "./liquid-glass";

afterEach(() => {
  delete document.documentElement.dataset.frontend;
  document.getElementById(MOBILE_LIQUID_GLASS_STYLE_ID)?.remove();
  document.getElementById(MOBILE_LIQUID_GLASS_HOST_ID)?.remove();
});

describe("mobile liquid glass", () => {
  it("mounts one unified, self-contained filter on mobile", () => {
    document.documentElement.dataset.frontend = "browser-mobile";
    const liquidGlass = new MobileLiquidGlass(document);

    expect(liquidGlass.mount()).toBe(true);
    expect(liquidGlass.mount()).toBe(true);
    expect(document.querySelectorAll(`#${MOBILE_LIQUID_GLASS_STYLE_ID}`)).toHaveLength(1);
    expect(document.querySelectorAll(`#${MOBILE_LIQUID_GLASS_HOST_ID}`)).toHaveLength(1);
    expect(document.head.querySelector(`#${MOBILE_LIQUID_GLASS_HOST_ID}`)).not.toBeNull();

    const filter = document.getElementById(MOBILE_LIQUID_GLASS_FILTER_ID)!;
    expect(filter.querySelectorAll("feDisplacementMap")).toHaveLength(1);
    expect(filter.querySelector("feColorMatrix")).toBeNull();
    expect(filter.querySelector("feImage")?.getAttribute("width")).toBe("100%");
    expect(filter.querySelector("feImage")?.getAttribute("height")).toBe("100%");
    expect(filter.querySelector("feDisplacementMap")?.getAttribute("scale")).toBe("16");
    expect(document.getElementById(MOBILE_LIQUID_GLASS_STYLE_ID)?.textContent)
      .toContain(`#editor::before`);
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
    expect(document.getElementById(MOBILE_LIQUID_GLASS_HOST_ID)).toBeNull();
  });
});
