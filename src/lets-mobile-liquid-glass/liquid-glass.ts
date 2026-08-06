import {
  MOBILE_LIQUID_GLASS_CSS,
} from "./liquid-glass-style";

export { MOBILE_LIQUID_GLASS_CSS } from "./liquid-glass-style";
export const MOBILE_LIQUID_GLASS_STYLE_ID = "damophus-mobile-liquid-glass-style";
export const MOBILE_LIQUID_GLASS_FILTER_HOST_ID = "damophus-mobile-liquid-glass-filter-host";
export const MOBILE_LIQUID_GLASS_FILTER_ID = "damophus-mobile-liquid-glass-filter";
const MOBILE_LIQUID_GLASS_MAP_URL = "/plugins/siyuan-damophus/neo-superfusion-map.png";

export function isMobileFrontend(root: HTMLElement): boolean {
  return root.dataset.frontend === "mobile" || root.dataset.frontend === "browser-mobile";
}

export class MobileLiquidGlass {
  private frontendObserver?: MutationObserver;
  private css = MOBILE_LIQUID_GLASS_CSS;

  constructor(private readonly targetDocument: Document = document) {}

  start(css = MOBILE_LIQUID_GLASS_CSS): void {
    this.css = css;
    if (this.mount()) return;
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
    this.mountFilterHost(head);
    if (!this.targetDocument.getElementById(MOBILE_LIQUID_GLASS_STYLE_ID)) {
      const style = this.targetDocument.createElement("style");
      style.id = MOBILE_LIQUID_GLASS_STYLE_ID;
      style.textContent = this.css;
      head.append(style);
    } else {
      const style = this.targetDocument.getElementById(MOBILE_LIQUID_GLASS_STYLE_ID);
      if (style?.textContent !== this.css) style.textContent = this.css;
    }
    return true;
  }

  destroy(): void {
    this.frontendObserver?.disconnect();
    this.frontendObserver = undefined;
    this.targetDocument.getElementById(MOBILE_LIQUID_GLASS_STYLE_ID)?.remove();
    this.targetDocument.getElementById(MOBILE_LIQUID_GLASS_FILTER_HOST_ID)?.remove();
  }

  private mountFilterHost(head: HTMLHeadElement): void {
    if (this.targetDocument.getElementById(MOBILE_LIQUID_GLASS_FILTER_HOST_ID)) return;
    const svg = this.targetDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = MOBILE_LIQUID_GLASS_FILTER_HOST_ID;
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    const defs = this.targetDocument.createElementNS("http://www.w3.org/2000/svg", "defs");
    const filter = this.targetDocument.createElementNS("http://www.w3.org/2000/svg", "filter");
    filter.id = MOBILE_LIQUID_GLASS_FILTER_ID;
    filter.setAttribute("color-interpolation-filters", "sRGB");
    filter.setAttribute("x", "-50%");
    filter.setAttribute("y", "-50%");
    filter.setAttribute("width", "200%");
    filter.setAttribute("height", "200%");
    const image = this.targetDocument.createElementNS("http://www.w3.org/2000/svg", "feImage");
    image.setAttribute("href", MOBILE_LIQUID_GLASS_MAP_URL);
    image.setAttribute("x", "0");
    image.setAttribute("y", "0");
    image.setAttribute("width", "100%");
    image.setAttribute("height", "82");
    image.setAttribute("result", "mapSource");
    image.setAttribute("preserveAspectRatio", "none");
    const blur = this.targetDocument.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
    blur.setAttribute("in", "mapSource");
    blur.setAttribute("stdDeviation", "0");
    blur.setAttribute("result", "map");
    const channel = (scale: string, result: string) => {
      const displacement = this.targetDocument.createElementNS("http://www.w3.org/2000/svg", "feDisplacementMap");
      displacement.setAttribute("in", "SourceGraphic");
      displacement.setAttribute("in2", "map");
      displacement.setAttribute("scale", scale);
      displacement.setAttribute("xChannelSelector", "R");
      displacement.setAttribute("yChannelSelector", "G");
      displacement.setAttribute("result", `disp${result}`);
      const matrix = this.targetDocument.createElementNS("http://www.w3.org/2000/svg", "feColorMatrix");
      matrix.setAttribute("in", `disp${result}`);
      matrix.setAttribute("type", "matrix");
      matrix.setAttribute("values", result === "R" ? "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" : result === "G" ? "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" : "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0");
      matrix.setAttribute("result", result);
      return [displacement, matrix];
    };
    const blendRG = this.targetDocument.createElementNS("http://www.w3.org/2000/svg", "feBlend");
    blendRG.setAttribute("in", "R"); blendRG.setAttribute("in2", "G"); blendRG.setAttribute("mode", "screen"); blendRG.setAttribute("result", "RG");
    const blendRGB = this.targetDocument.createElementNS("http://www.w3.org/2000/svg", "feBlend");
    blendRGB.setAttribute("in", "RG"); blendRGB.setAttribute("in2", "B"); blendRGB.setAttribute("mode", "screen"); blendRGB.setAttribute("result", "refracted");
    const composite = this.targetDocument.createElementNS("http://www.w3.org/2000/svg", "feComposite");
    composite.setAttribute("in", "refracted"); composite.setAttribute("in2", "SourceGraphic"); composite.setAttribute("operator", "in");
    filter.append(image, blur, ...channel("28.63808971827122", "R"), ...channel("31.82009968696802", "G"), ...channel("35.002109655664825", "B"), blendRG, blendRGB, composite);
    defs.append(filter);
    svg.append(defs);
    head.append(svg);
  }
}
