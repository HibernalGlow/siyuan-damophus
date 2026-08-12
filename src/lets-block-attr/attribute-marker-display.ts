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
  private readonly pendingRoots = new Set<ParentNode>();

  private removeMarkers(): void {
    document.querySelectorAll(`.${BLOCK_ATTRIBUTE_MARKER_CLASS}`).forEach((marker) => marker.remove());
  }

  private scheduleRefresh(refresh: (root: ParentNode) => void, roots: readonly ParentNode[]): void {
    roots.forEach((root) => this.pendingRoots.add(root));
    if (this.refreshFrame !== undefined) return;
    this.refreshFrame = requestAnimationFrame(() => {
      this.refreshFrame = undefined;
      const pending = [...this.pendingRoots];
      this.pendingRoots.clear();
      pending.forEach(refresh);
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
    const refresh = (root: ParentNode) => syncCustomPropertyMarkers(root, selector, properties);

    this.styleElement = document.createElement("style");
    this.styleElement.id = ATTRIBUTE_MARKER_STYLE_ID;
    this.styleElement.textContent = css;
    document.head.appendChild(this.styleElement);
    refresh(document);
    this.observer = new MutationObserver((records) => {
      const roots = new Set<ParentNode>();
      for (const record of records) {
        const element = record.target instanceof Element
          ? record.target
          : record.target.parentElement;
        const editor = element?.closest<HTMLElement>(".protyle-wysiwyg");
        if (editor) roots.add(editor);
      }
      this.scheduleRefresh(refresh, [...roots]);
    });
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
    this.pendingRoots.clear();
    this.removeMarkers();
    this.styleElement?.remove();
    this.styleElement = undefined;
  }
}
