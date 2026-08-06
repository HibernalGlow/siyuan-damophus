const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export const MOBILE_LIQUID_GLASS_HOST_ID = "damophus-mobile-liquid-glass-host";
export const MOBILE_LIQUID_GLASS_FILTER_ID = "damophus-mobile-liquid-glass-filter";
export const MOBILE_LIQUID_GLASS_STYLE_ID = "damophus-mobile-liquid-glass-style";

const LIQUID_MAP = `
<svg xmlns="http://www.w3.org/2000/svg" width="478" height="24" viewBox="0 0 478 24">
  <defs>
    <linearGradient id="x-refraction" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#800000"/>
      <stop offset="0.1" stop-color="#680000"/>
      <stop offset="0.23" stop-color="#940000"/>
      <stop offset="0.38" stop-color="#740000"/>
      <stop offset="0.5" stop-color="#800000"/>
      <stop offset="0.64" stop-color="#900000"/>
      <stop offset="0.8" stop-color="#700000"/>
      <stop offset="0.92" stop-color="#980000"/>
      <stop offset="1" stop-color="#800000"/>
    </linearGradient>
    <linearGradient id="y-refraction" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#008000"/>
      <stop offset="0.14" stop-color="#008000"/>
      <stop offset="0.32" stop-color="#00a800"/>
      <stop offset="0.47" stop-color="#00ec00"/>
      <stop offset="0.58" stop-color="#008000"/>
      <stop offset="0.72" stop-color="#002400"/>
      <stop offset="0.88" stop-color="#006c00"/>
      <stop offset="1" stop-color="#008000"/>
    </linearGradient>
  </defs>
  <g style="mix-blend-mode:screen">
    <rect width="478" height="24" fill="url(#x-refraction)"/>
    <rect width="478" height="24" fill="url(#y-refraction)"/>
  </g>
</svg>`;

export const MOBILE_LIQUID_GLASS_CSS = `
html[data-frontend="mobile"],
html[data-frontend="browser-mobile"] {
    --damophus-mobile-glass-core: oklch(from var(--b3-theme-background) l c h / 0.68);
    --damophus-mobile-glass-tail: oklch(from var(--b3-theme-background) l c h / 0.32);
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

html[data-frontend="mobile"] #editor,
html[data-frontend="browser-mobile"] #editor {
    position: relative;
}

html[data-frontend="mobile"] #editor::before,
html[data-frontend="browser-mobile"] #editor::before {
    content: "";
    position: absolute;
    inset: 0 0 auto;
    height: 82px;
    z-index: 4;
    pointer-events: none;
    background: linear-gradient(
        180deg,
        var(--damophus-mobile-glass-core) 0,
        var(--damophus-mobile-glass-core) 58px,
        var(--damophus-mobile-glass-tail) 68px,
        transparent 82px
    );
    -webkit-backdrop-filter: blur(1px) saturate(1.2);
    backdrop-filter: blur(1px) saturate(1.2);
    box-shadow: inset 0 1px 0 0 var(--damophus-mobile-glass-highlight);
}

html[data-frontend="mobile"] #editor::after,
html[data-frontend="browser-mobile"] #editor::after {
    content: "";
    position: absolute;
    inset: 58px 0 auto;
    height: 24px;
    z-index: 4;
    pointer-events: none;
    background: linear-gradient(
        180deg,
        var(--damophus-mobile-glass-core) 0,
        var(--damophus-mobile-glass-tail) 32%,
        transparent 100%
    );
    -webkit-backdrop-filter: url(#${MOBILE_LIQUID_GLASS_FILTER_ID}) saturate(1.2);
    backdrop-filter: url(#${MOBILE_LIQUID_GLASS_FILTER_ID}) saturate(1.2);
    -webkit-mask-image: linear-gradient(180deg, #000 0, rgba(0, 0, 0, 0.9) 58%, transparent 100%);
    mask-image: linear-gradient(180deg, #000 0, rgba(0, 0, 0, 0.9) 58%, transparent 100%);
    box-shadow:
        inset 0 -1px 0 0 var(--damophus-mobile-glass-highlight),
        0 3px 10px 1px var(--damophus-mobile-glass-shadow);
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

export function isMobileFrontend(root: HTMLElement): boolean {
  return root.dataset.frontend === "mobile" || root.dataset.frontend === "browser-mobile";
}

export class MobileLiquidGlass {
  private frontendObserver?: MutationObserver;

  constructor(private readonly targetDocument: Document = document) {}

  start(): void {
    if (this.mount() || typeof MutationObserver === "undefined") return;
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

    if (!this.targetDocument.getElementById(MOBILE_LIQUID_GLASS_HOST_ID)) {
      head.append(this.createFilterHost());
    }
    return true;
  }

  destroy(): void {
    this.frontendObserver?.disconnect();
    this.frontendObserver = undefined;
    this.targetDocument.getElementById(MOBILE_LIQUID_GLASS_STYLE_ID)?.remove();
    this.targetDocument.getElementById(MOBILE_LIQUID_GLASS_HOST_ID)?.remove();
  }

  private createFilterHost(): SVGSVGElement {
    const svg = this.targetDocument.createElementNS(SVG_NAMESPACE, "svg");
    svg.id = MOBILE_LIQUID_GLASS_HOST_ID;
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.position = "fixed";
    svg.style.pointerEvents = "none";

    const defs = this.targetDocument.createElementNS(SVG_NAMESPACE, "defs");
    const filter = this.targetDocument.createElementNS(SVG_NAMESPACE, "filter");
    filter.id = MOBILE_LIQUID_GLASS_FILTER_ID;
    filter.setAttribute("color-interpolation-filters", "sRGB");
    filter.setAttribute("x", "-50%");
    filter.setAttribute("y", "-50%");
    filter.setAttribute("width", "200%");
    filter.setAttribute("height", "200%");

    const image = this.targetDocument.createElementNS(SVG_NAMESPACE, "feImage");
    image.setAttribute("href", `data:image/svg+xml,${encodeURIComponent(LIQUID_MAP)}`);
    image.setAttribute("width", "100%");
    image.setAttribute("height", "100%");
    image.setAttribute("preserveAspectRatio", "none");
    image.setAttribute("result", "map");

    const displacement = this.targetDocument.createElementNS(SVG_NAMESPACE, "feDisplacementMap");
    displacement.setAttribute("in", "SourceGraphic");
    displacement.setAttribute("in2", "map");
    displacement.setAttribute("scale", "28");
    displacement.setAttribute("xChannelSelector", "R");
    displacement.setAttribute("yChannelSelector", "G");

    filter.append(image, displacement);
    defs.append(filter);
    svg.append(defs);
    return svg;
  }
}
