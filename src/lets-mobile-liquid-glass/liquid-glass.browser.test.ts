import { afterEach, describe, expect, it } from "vitest";
import {
  MOBILE_LIQUID_GLASS_STYLE_ID,
  MOBILE_LIQUID_GLASS_FILTER_HOST_ID,
  MOBILE_LIQUID_GLASS_FILTER_ID,
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
  document.getElementById(MOBILE_LIQUID_GLASS_FILTER_HOST_ID)?.remove();
});

describe("mobile liquid glass", () => {
  it("mounts one unified CSS glass surface with an isolated filter host", () => {
    document.documentElement.dataset.frontend = "browser-mobile";
    const liquidGlass = new MobileLiquidGlass(document);

    expect(liquidGlass.mount()).toBe(true);
    expect(liquidGlass.mount()).toBe(true);
    expect(document.querySelectorAll(`#${MOBILE_LIQUID_GLASS_STYLE_ID}`)).toHaveLength(1);
    const css = document.getElementById(MOBILE_LIQUID_GLASS_STYLE_ID)?.textContent ?? "";
    expect(css).toContain(`#editor::before`);
    expect(css).not.toContain(`.protyle-breadcrumb::before`);
    expect(css).toContain(`--_damophus-superfusion-liquid-glass-filter: url(#damophus-mobile-liquid-glass-filter) saturate(1.5)`);
    expect(css).toContain(`backdrop-filter: var(--_damophus-superfusion-liquid-glass-filter)`);
    expect(css).not.toContain(`#sidebar .toolbar__icon`);
    expect(css).not.toMatch(/(?:^|[,{])\s*(?:svg|use|symbol)\b/);
    expect(document.querySelectorAll(`#${MOBILE_LIQUID_GLASS_FILTER_HOST_ID}`)).toHaveLength(1);
    const filter = document.getElementById(MOBILE_LIQUID_GLASS_FILTER_ID);
    expect(filter?.querySelector("feTurbulence")).toBeNull();
    expect(filter?.querySelector("feImage")?.getAttribute("href"))
      .toBe("/plugins/siyuan-damophus/neo-superfusion-map.png");
    expect(filter?.querySelector("feImage")?.getAttribute("width")).toBe("100%");
    expect(filter?.querySelector("feImage")?.getAttribute("height")).toBe("82");
    expect(filter?.querySelectorAll("feDisplacementMap")).toHaveLength(3);
    expect([...filter?.querySelectorAll("feDisplacementMap") ?? []].map((node) => node.getAttribute("scale")))
      .toEqual(["28.63808971827122", "31.82009968696802", "35.002109655664825"]);
    expect(filter?.querySelectorAll("feColorMatrix")).toHaveLength(3);
    expect(filter?.querySelectorAll("feBlend")).toHaveLength(2);
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

  it("keeps liquid glass as the default and supports all three independent presets", () => {
    expect(normalizeMobileLiquidGlassPreset(undefined)).toBe("liquid-glass");
    expect(normalizeMobileLiquidGlassPreset("unknown")).toBe("liquid-glass");
    expect(normalizeMobileLiquidGlassPreset("neo-plus")).toBe("frosted-glass");

    expect(buildMobileLiquidGlassCss("blur")).toContain("backdrop-filter: blur(3px)");
    expect(buildMobileLiquidGlassCss("frosted-glass")).toContain("backdrop-filter: blur(6px) brightness(0.9)");
    expect(buildMobileLiquidGlassCss("liquid-glass")).toContain("url(#damophus-mobile-liquid-glass-filter) saturate(1.5)");
  });

  it("updates the mounted style without adding another style element", () => {
    document.documentElement.dataset.frontend = "mobile";
    const liquidGlass = new MobileLiquidGlass(document);
    liquidGlass.start(buildMobileLiquidGlassCss("blur"));
    liquidGlass.start(buildMobileLiquidGlassCss("liquid-glass"));

    expect(document.querySelectorAll(`#${MOBILE_LIQUID_GLASS_STYLE_ID}`)).toHaveLength(1);
    expect(document.getElementById(MOBILE_LIQUID_GLASS_STYLE_ID)?.textContent)
      .toContain("url(#damophus-mobile-liquid-glass-filter) saturate(1.5)");
  });
});
