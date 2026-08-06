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
    background: transparent !important;
    border-bottom: 0;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
}
`;

export type MobileLiquidGlassPreset = "blur" | "frosted-glass" | "liquid-glass";

const SHARED = `
html[data-frontend="mobile"],
html[data-frontend="browser-mobile"] {
    --damophus-mobile-glass-highlight: hsla(0, 0%, 100%, 0.16);
    --damophus-mobile-glass-shadow: hsla(0, 0%, 0%, 0.12);
}

html[data-frontend="mobile"].neo-mode-dark,
html[data-frontend="browser-mobile"].neo-mode-dark,
html[data-frontend="mobile"][data-theme-mode="dark"],
html[data-frontend="browser-mobile"][data-theme-mode="dark"] {
    --damophus-mobile-glass-highlight: hsla(0, 0%, 100%, 0.1);
    --damophus-mobile-glass-shadow: hsla(0, 0%, 0%, 0.3);
}
`;

const BLUR = `
html[data-frontend="mobile"] #editor::before,
html[data-frontend="browser-mobile"] #editor::before {
    content: "";
    position: absolute;
    inset: 0 0 auto;
    height: 126px;
    pointer-events: none;
    z-index: 2;
    background-color: transparent;
    -webkit-backdrop-filter: blur(3px);
    backdrop-filter: blur(3px);
    -webkit-mask: linear-gradient(180deg, #000 0 42px, transparent 126px);
    mask: linear-gradient(180deg, #000 0 42px, transparent 126px);
    background-image: linear-gradient(to bottom,
        rgb(from var(--b3-theme-background) r g b / 0.92) 2%,
        rgb(from var(--b3-theme-background) r g b / 0.738) 19%,
        rgb(from var(--b3-theme-background) r g b / 0.541) 34%,
        rgb(from var(--b3-theme-background) r g b / 0.382) 47%,
        rgb(from var(--b3-theme-background) r g b / 0.278) 56.5%,
        rgb(from var(--b3-theme-background) r g b / 0.194) 65%,
        rgb(from var(--b3-theme-background) r g b / 0.126) 73%,
        rgb(from var(--b3-theme-background) r g b / 0.075) 80.2%,
        rgb(from var(--b3-theme-background) r g b / 0.042) 86.1%,
        rgb(from var(--b3-theme-background) r g b / 0.021) 91%,
        rgb(from var(--b3-theme-background) r g b / 0.008) 95.2%,
        rgb(from var(--b3-theme-background) r g b / 0.002) 98.2%,
        rgb(from var(--b3-theme-background) r g b / 0) 100%);
}
`;

const FROSTED = `
html[data-frontend="mobile"] #editor::before,
html[data-frontend="browser-mobile"] #editor::before {
    content: "";
    position: absolute;
    inset: 0 0 auto;
    height: 80px;
    pointer-events: none;
    z-index: 2;
    background: oklch(from var(--b3-theme-background) l c h / 0.5);
    -webkit-backdrop-filter: blur(6px) brightness(0.9);
    backdrop-filter: blur(6px) brightness(0.9);
    box-shadow: 0 1px 0 0 var(--damophus-mobile-glass-highlight), 0 2px 8px 1px var(--damophus-mobile-glass-shadow);
}

html[data-frontend="mobile"] #editor::after,
html[data-frontend="browser-mobile"] #editor::after {
    content: "";
    position: absolute;
    inset: 0 0 auto;
    height: 160px;
    pointer-events: none;
    z-index: 2;
    -webkit-backdrop-filter: blur(40px) saturate(3.5);
    backdrop-filter: blur(40px) saturate(3.5);
    -webkit-mask: linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.7) 80px, #000 80px, #000 81px, transparent 81px, transparent 160px);
    mask: linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.7) 80px, #000 80px, #000 81px, transparent 81px, transparent 160px);
}
`;

const LIQUID = `
html[data-frontend="mobile"] #editor::before,
html[data-frontend="browser-mobile"] #editor::before {
    content: "";
    position: absolute;
    inset: 0 0 auto;
    height: 80px;
    pointer-events: none;
    z-index: 2;
    background: oklch(from var(--b3-theme-background) l c h / 0.04);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    box-shadow: 0 1px 0 0 var(--damophus-mobile-glass-highlight), 0 2px 8px 1px var(--damophus-mobile-glass-shadow);
}

html[data-frontend="mobile"] #editor::after,
html[data-frontend="browser-mobile"] #editor::after {
    content: "";
    position: absolute;
    inset: 0 0 auto;
    height: 80px;
    pointer-events: none;
    z-index: 2;
    -webkit-backdrop-filter: url(#damophus-mobile-liquid-glass-filter) saturate(1.5);
    backdrop-filter: url(#damophus-mobile-liquid-glass-filter) saturate(1.5);
    -webkit-mask: linear-gradient(to bottom, #000 0, rgba(0, 0, 0, 0.72) 4px, transparent 9px 71px, rgba(0, 0, 0, 0.72) 76px, #000 80px);
    mask: linear-gradient(to bottom, #000 0, rgba(0, 0, 0, 0.72) 4px, transparent 9px 71px, rgba(0, 0, 0, 0.72) 76px, #000 80px);
}
`;

export function normalizeMobileLiquidGlassPreset(value: unknown): MobileLiquidGlassPreset {
    if (value === "blur") return "blur";
    if (value === "frosted-glass" || value === "neo-plus") return "frosted-glass";
    return "liquid-glass";
}

export function buildMobileLiquidGlassCss(preset: MobileLiquidGlassPreset): string {
    const surface = preset === "blur" ? BLUR : preset === "frosted-glass" ? FROSTED : LIQUID;
    return `${MOBILE_LIQUID_GLASS_LAYOUT_CSS}\n${SHARED}\n${surface}`;
}

export const MOBILE_LIQUID_GLASS_SURFACE_CSS = LIQUID;
export const MOBILE_LIQUID_GLASS_CSS = buildMobileLiquidGlassCss("liquid-glass");
