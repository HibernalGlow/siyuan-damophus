import InsertCSS from "@/myscripts/insertCSS";
import { settings } from "@/settings";
import pluginMetadata from "./plugin";
import {
  buildCustomPropertiesCss,
  DEFAULT_CUSTOM_PROPERTIES,
  DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
} from "./custom-properties";

export default class ShowCustomPropertiesUnderTitle extends InsertCSS {
  id = "snippetCSS-hqweay-show-custom-properties-under-title";

  onload(
    customProperties = settings.getBySpace(pluginMetadata.name, "customProperties")
      ?? DEFAULT_CUSTOM_PROPERTIES,
    customPropertyBlockTypes = settings.getBySpace(pluginMetadata.name, "customPropertyBlockTypes")
      ?? DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
  ) {
    this.onunload();
    const css = buildCustomPropertiesCss(customProperties, customPropertyBlockTypes);
    if (!css) return;

    const styleElement = document.createElement("style");
    styleElement.id = this.id;
    styleElement.textContent = css;
    document.head.appendChild(styleElement);
  }
}
