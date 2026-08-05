import InsertCSS from "@/myscripts/insertCSS";
import { settings } from "@/settings";
import pluginMetadata from "./plugin";
import {
  buildCustomPropertiesCss,
  DEFAULT_CUSTOM_PROPERTIES,
  DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
  DEFAULT_CUSTOM_PROPERTY_STYLE,
} from "./custom-properties";
import type { ThemeVariables } from "@/theme/schema";

export default class ShowCustomPropertiesUnderTitle extends InsertCSS {
  id = "snippetCSS-hqweay-show-custom-properties-under-title";

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

    const styleElement = document.createElement("style");
    styleElement.id = this.id;
    styleElement.textContent = css;
    document.head.appendChild(styleElement);
  }
}
