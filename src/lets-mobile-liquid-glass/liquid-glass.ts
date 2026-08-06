import {
  MOBILE_LIQUID_GLASS_CSS,
} from "./liquid-glass-style";

export { MOBILE_LIQUID_GLASS_CSS } from "./liquid-glass-style";
export const MOBILE_LIQUID_GLASS_STYLE_ID = "damophus-mobile-liquid-glass-style";

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
  }
}
