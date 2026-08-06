import { afterEach, describe, expect, it } from "vitest";
import {
  MOBILE_LIQUID_GLASS_STYLE_ID,
  MobileLiquidGlass,
} from "./liquid-glass";
import {
  buildMobileLiquidGlassCss,
  normalizeMobileLiquidGlassPreset,
} from "./liquid-glass-style";

afterEach(() => {
  delete document.documentElement.dataset.frontend;
  document.body.replaceChildren();
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
    expect(css).toContain(`#editor > .protyle-breadcrumb::before`);
    expect(css).not.toContain(`#editor::before`);
    expect(css).toContain(`isolation: isolate`);
    expect(css).toContain(`backdrop-filter: blur(5px) saturate(1.24) contrast(1.03)`);
    expect(css).not.toContain(`#sidebar .toolbar__icon`);
    expect(css).not.toMatch(/(?:^|[,{])\s*(?:svg|use|symbol)\b/);
    expect(css).not.toContain(`backdrop-filter: url(`);
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

  it("keeps high transparency as the default and can switch to the Neo+ preset", () => {
    expect(normalizeMobileLiquidGlassPreset(undefined)).toBe("transparent");
    expect(normalizeMobileLiquidGlassPreset("unknown")).toBe("transparent");
    expect(normalizeMobileLiquidGlassPreset("neo-plus")).toBe("neo-plus");

    const transparent = buildMobileLiquidGlassCss("transparent");
    const neoPlus = buildMobileLiquidGlassCss("neo-plus");
    expect(transparent).toContain("oklch(from var(--b3-theme-background) l c h / 0.52)");
    expect(transparent).toContain("blur(5px) saturate(1.24) contrast(1.03)");
    expect(neoPlus).toContain("oklch(from var(--b3-theme-background) l c h / 0.64)");
    expect(neoPlus).toContain("blur(6px) saturate(1.5) brightness(0.9)");
  });

  it("updates the mounted style without adding another style element", () => {
    document.documentElement.dataset.frontend = "mobile";
    const liquidGlass = new MobileLiquidGlass(document);
    liquidGlass.start(buildMobileLiquidGlassCss("transparent"));
    liquidGlass.start(buildMobileLiquidGlassCss("neo-plus"));

    expect(document.querySelectorAll(`#${MOBILE_LIQUID_GLASS_STYLE_ID}`)).toHaveLength(1);
    expect(document.getElementById(MOBILE_LIQUID_GLASS_STYLE_ID)?.textContent)
      .toContain("blur(6px) saturate(1.5) brightness(0.9)");
  });
});
