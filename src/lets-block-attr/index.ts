import { getLogger } from "@/libs/logger";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { settings } from "@/settings";

import ShowCustomPropertiesUnderTitle from "./ShowCustomPropertiesUnderTitle";
import {
  DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
  resolveCustomProperties,
} from "./custom-properties";
import pluginMetadata from "./plugin";

const log = getLogger("lets-block-attr");

export default class BlockAttr extends SubPluginBase {
  private readonly display = new ShowCustomPropertiesUnderTitle();

  override onload(): void {
    const customProperties = resolveCustomProperties(
      settings.getBySpace(pluginMetadata.name, "customProperties"),
    );
    if (customProperties.migrated) {
      settings.setBySpace(
        pluginMetadata.name,
        "customProperties",
        customProperties.value,
      );
      void settings.save().catch((error) => {
        log.error("Failed to migrate the custom property display defaults", error);
      });
    }

    this.display.onload(
      customProperties.value,
      settings.getBySpace(pluginMetadata.name, "customPropertyBlockTypes")
        ?? DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
    );
  }

  override onunload(): void {
    this.display.onunload();
  }
}
