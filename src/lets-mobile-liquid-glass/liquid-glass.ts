export const MOBILE_LIQUID_GLASS_STYLE_ID = "damophus-mobile-liquid-glass-style";
export const MOBILE_LIQUID_GLASS_CSS = `
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

/* Neo+'s mobile drawer blur composites its SVG toolbar icons as invisible
   layers. Keep the drawer's translucent background, but let its native icons
   render in the normal mobile compositor. */
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

export function isMobileFrontend(root: HTMLElement): boolean {
  return root.dataset.frontend === "mobile" || root.dataset.frontend === "browser-mobile";
}

export class MobileLiquidGlass {
  private frontendObserver?: MutationObserver;

  constructor(private readonly targetDocument: Document = document) {}

  start(): void {
    if (this.mount()) {
      return;
    }
    if (typeof MutationObserver === "undefined") return;
    this.frontendObserver?.disconnect();
    this.frontendObserver = new MutationObserver(() => {
      if (!this.mount()) return;
      this.frontendObserver?.disconnect();
      this.frontendObserver = undefined;
    });
    this.frontendObserver.observe(this.targetDocument.documentElement, {
      attributes: true,
      attributeFilter: ["data-frontend"],
    });
  }

  mount(): boolean {
    const { documentElement, head } = this.targetDocument;
    if (!head || !isMobileFrontend(documentElement)) return false;

    if (!this.targetDocument.getElementById(MOBILE_LIQUID_GLASS_STYLE_ID)) {
      const style = this.targetDocument.createElement("style");
      style.id = MOBILE_LIQUID_GLASS_STYLE_ID;
      style.textContent = MOBILE_LIQUID_GLASS_CSS;
      head.append(style);
    }

    return true;
  }

  destroy(): void {
    this.frontendObserver?.disconnect();
    this.frontendObserver = undefined;
    this.targetDocument.getElementById(MOBILE_LIQUID_GLASS_STYLE_ID)?.remove();
  }
}
