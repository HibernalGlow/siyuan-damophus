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

export const MOBILE_LIQUID_GLASS_SURFACE_CSS = `
html[data-frontend="mobile"],
html[data-frontend="browser-mobile"] {
    --damophus-mobile-glass-core: oklch(from var(--b3-theme-background) l c h / 0.52);
    --damophus-mobile-glass-tail: oklch(from var(--b3-theme-background) l c h / 0.18);
    --damophus-mobile-glass-highlight: hsla(0, 0%, 100%, 0.22);
    --damophus-mobile-glass-shadow: hsla(0, 0%, 0%, 0.08);
}

html[data-frontend="mobile"].neo-mode-dark,
html[data-frontend="browser-mobile"].neo-mode-dark,
html[data-frontend="mobile"][data-theme-mode="dark"],
html[data-frontend="browser-mobile"][data-theme-mode="dark"] {
    --damophus-mobile-glass-highlight: hsla(0, 0%, 100%, 0.12);
    --damophus-mobile-glass-shadow: hsla(0, 0%, 0%, 0.24);
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
    -webkit-backdrop-filter: blur(5px) saturate(1.24) contrast(1.03);
    backdrop-filter: blur(5px) saturate(1.24) contrast(1.03);
    -webkit-mask-image: linear-gradient(180deg, #000 0, #000 72%, rgba(0, 0, 0, 0.86) 90%, transparent 100%);
    mask-image: linear-gradient(180deg, #000 0, #000 72%, rgba(0, 0, 0, 0.86) 90%, transparent 100%);
    box-shadow:
        inset 0 1px 0 0 var(--damophus-mobile-glass-highlight),
        inset 0 -1px 0 0 var(--damophus-mobile-glass-highlight),
        0 2px 8px 0 var(--damophus-mobile-glass-shadow);
}
`;

export const MOBILE_LIQUID_GLASS_CSS = `${MOBILE_LIQUID_GLASS_LAYOUT_CSS}\n${MOBILE_LIQUID_GLASS_SURFACE_CSS}`;
