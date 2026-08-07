import InsertCSS from "@/myscripts/insertCSS";
import { settings } from "@/settings";
import pluginMetadata from "./plugin";
import {
  BLOCK_ATTRIBUTE_MARKER_CLASS,
  buildCustomPropertiesCss,
  customPropertyTargetSelector,
  DEFAULT_CUSTOM_PROPERTIES,
  DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
  DEFAULT_CUSTOM_PROPERTY_STYLE,
  parseCustomProperties,
  syncCustomPropertyMarkers,
} from "./custom-properties";
import type { ThemeVariables } from "@/theme/schema";

export default class ShowCustomPropertiesUnderTitle extends InsertCSS {
  id = "snippetCSS-hqweay-show-custom-properties-under-title";
  private observer?: MutationObserver;
  private refreshFrame?: number;

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
    customProperties = settings.getBySpace(pluginMetadata.name, "customProperties")
      ?? DEFAULT_CUSTOM_PROPERTIES,
    customPropertyBlockTypes = settings.getBySpace(pluginMetadata.name, "customPropertyBlockTypes")
      ?? DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
    customStyle = settings.getBySpace(pluginMetadata.name, "customStyle")
      ?? DEFAULT_CUSTOM_PROPERTY_STYLE,
    themeVariables: ThemeVariables = {},
  ) {
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

    const styleElement = document.createElement("style");
    styleElement.id = this.id;
    styleElement.textContent = css;
    document.head.appendChild(styleElement);
    refresh();
    this.observer = new MutationObserver(() => this.scheduleRefresh(refresh));
    this.observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-type", ...properties.map(({ key }) => key)],
    });
  }

  override onunload(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    if (this.refreshFrame !== undefined) cancelAnimationFrame(this.refreshFrame);
    this.refreshFrame = undefined;
    this.removeMarkers();
    super.onunload();
  }
}
