import type { ThemeVariables } from "@/theme/schema";
import {
  BLOCK_ATTRIBUTE_MARKER_CLASS,
  buildCustomPropertiesCss,
  customPropertyTargetSelector,
  parseCustomProperties,
  syncCustomPropertyMarkers,
} from "./custom-properties";

export const ATTRIBUTE_MARKER_STYLE_ID = "damophus-block-attribute-display-style";

export default class AttributeMarkerDisplay {
  private observer?: MutationObserver;
  private refreshFrame?: number;
  private styleElement?: HTMLStyleElement;

  private removeMarkers(): void {
    document.querySelectorAll(`.${BLOCK_ATTRIBUTE_MARKER_CLASS}`).forEach((marker) => marker.remove());
  }

  private scheduleRefresh(refresh: () => void): void {
    if (this.refreshFrame !== undefined) return;
    this.refreshFrame = requestAnimationFrame(() => {
      this.refreshFrame = undefined;
      refresh();
    });
  }

  onload(
    customProperties: string,
    customPropertyBlockTypes: string,
    customStyle: string,
    themeVariables: ThemeVariables = {},
  ): void {
    this.onunload();
    const css = buildCustomPropertiesCss(
      customProperties,
      customPropertyBlockTypes,
      customStyle,
      themeVariables,
    );
    if (!css) return;

    const properties = parseCustomProperties(customProperties);
    const selector = customPropertyTargetSelector(customPropertyBlockTypes);
    const refresh = () => syncCustomPropertyMarkers(document, selector, properties);

    this.styleElement = document.createElement("style");
    this.styleElement.id = ATTRIBUTE_MARKER_STYLE_ID;
    this.styleElement.textContent = css;
    document.head.appendChild(this.styleElement);
    refresh();
    this.observer = new MutationObserver(() => this.scheduleRefresh(refresh));
    this.observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-type", ...properties.map(({ key }) => key)],
    });
  }

  onunload(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    if (this.refreshFrame !== undefined) cancelAnimationFrame(this.refreshFrame);
    this.refreshFrame = undefined;
    this.removeMarkers();
    this.styleElement?.remove();
    this.styleElement = undefined;
  }
}
