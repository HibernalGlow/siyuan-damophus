export const MOBILE_LIQUID_GLASS_LAYOUT_CSS = `
html[data-frontend="mobile"] > body > .toolbar,
html[data-frontend="browser-mobile"] > body > .toolbar {
    position: absolute;
    inset: 0 0 auto;
    width: 100%;
    z-index: 6;
    background: transparent !important;
    border-bottom-color: transparent;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
}

html[data-frontend="mobile"] #editor > .protyle-breadcrumb,
html[data-frontend="browser-mobile"] #editor > .protyle-breadcrumb {
    position: absolute;
    inset: 40px 0 auto;
    width: 100%;
    z-index: 5;
    isolation: isolate;
    background: transparent !important;
    border-bottom: 0;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
}
`;

export type MobileLiquidGlassPreset = "transparent" | "neo-plus";

interface MobileLiquidGlassStyleValues {
    coreAlpha: number;
    tailAlpha: number;
    highlightAlpha: number;
    darkHighlightAlpha: number;
    shadowAlpha: number;
    darkShadowAlpha: number;
    filter: string;
}

const MOBILE_LIQUID_GLASS_PRESETS: Record<MobileLiquidGlassPreset, MobileLiquidGlassStyleValues> = {
    transparent: {
        coreAlpha: 0.52,
        tailAlpha: 0.18,
        highlightAlpha: 0.22,
        darkHighlightAlpha: 0.12,
        shadowAlpha: 0.08,
        darkShadowAlpha: 0.24,
        filter: "blur(5px) saturate(1.24) contrast(1.03)",
    },
    "neo-plus": {
        coreAlpha: 0.64,
        tailAlpha: 0.26,
        highlightAlpha: 0.2,
        darkHighlightAlpha: 0.1,
        shadowAlpha: 0.1,
        darkShadowAlpha: 0.28,
        filter: "blur(6px) saturate(1.5) brightness(0.9)",
    },
};

export function normalizeMobileLiquidGlassPreset(value: unknown): MobileLiquidGlassPreset {
    return value === "neo-plus" ? "neo-plus" : "transparent";
}

function buildMobileLiquidGlassSurfaceCss(preset: MobileLiquidGlassPreset): string {
    const style = MOBILE_LIQUID_GLASS_PRESETS[preset];
    return `
html[data-frontend="mobile"],
html[data-frontend="browser-mobile"] {
    --damophus-mobile-glass-core: oklch(from var(--b3-theme-background) l c h / ${style.coreAlpha});
    --damophus-mobile-glass-tail: oklch(from var(--b3-theme-background) l c h / ${style.tailAlpha});
    --damophus-mobile-glass-highlight: hsla(0, 0%, 100%, ${style.highlightAlpha});
    --damophus-mobile-glass-shadow: hsla(0, 0%, 0%, ${style.shadowAlpha});
}

html[data-frontend="mobile"].neo-mode-dark,
html[data-frontend="browser-mobile"].neo-mode-dark,
html[data-frontend="mobile"][data-theme-mode="dark"],
html[data-frontend="browser-mobile"][data-theme-mode="dark"] {
    --damophus-mobile-glass-highlight: hsla(0, 0%, 100%, ${style.darkHighlightAlpha});
    --damophus-mobile-glass-shadow: hsla(0, 0%, 0%, ${style.darkShadowAlpha});
}

html[data-frontend="mobile"] #editor > .protyle-breadcrumb::before,
html[data-frontend="browser-mobile"] #editor > .protyle-breadcrumb::before {
    content: "";
    position: absolute;
    inset: -40px 0 auto;
    height: 82px;
    z-index: -1;
    pointer-events: none;
    background: linear-gradient(
        180deg,
        var(--damophus-mobile-glass-core) 0,
        var(--damophus-mobile-glass-core) 58px,
        var(--damophus-mobile-glass-tail) 68px,
        transparent 82px
    );
    -webkit-backdrop-filter: ${style.filter};
    backdrop-filter: ${style.filter};
    -webkit-mask-image: linear-gradient(180deg, #000 0, #000 72%, rgba(0, 0, 0, 0.86) 90%, transparent 100%);
    mask-image: linear-gradient(180deg, #000 0, #000 72%, rgba(0, 0, 0, 0.86) 90%, transparent 100%);
    box-shadow:
        inset 0 1px 0 0 var(--damophus-mobile-glass-highlight),
        inset 0 -1px 0 0 var(--damophus-mobile-glass-highlight),
        0 2px 8px 0 var(--damophus-mobile-glass-shadow);
}
`;
}

export const MOBILE_LIQUID_GLASS_SURFACE_CSS = buildMobileLiquidGlassSurfaceCss("transparent");

export function buildMobileLiquidGlassCss(preset: MobileLiquidGlassPreset): string {
    return `${MOBILE_LIQUID_GLASS_LAYOUT_CSS}\n${buildMobileLiquidGlassSurfaceCss(preset)}`;
}

export const MOBILE_LIQUID_GLASS_CSS = buildMobileLiquidGlassCss("transparent");
