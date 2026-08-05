import { getLogger } from "@/libs/logger";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { settings } from "@/settings";
import { getHostColorMode, markerThemeVariables, observeHostColorMode } from "@/theme/runtime";
import { parseStoredThemes } from "@/theme/schema";
import { DEFAULT_THEME_ID, findTheme } from "@/theme/themes";

import ShowCustomPropertiesUnderTitle from "./ShowCustomPropertiesUnderTitle";
import {
  DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
  DEFAULT_CUSTOM_PROPERTY_STYLE,
  resolveCustomProperties,
} from "./custom-properties";
import pluginMetadata from "./plugin";

const log = getLogger("lets-block-attr");

export default class BlockAttr extends SubPluginBase {
  private readonly display = new ShowCustomPropertiesUnderTitle();
  private stopColorModeObserver?: () => void;

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

    const customPropertyBlockTypes = settings.getBySpace(pluginMetadata.name, "customPropertyBlockTypes")
      ?? DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES;
    const customStyle = settings.getBySpace(pluginMetadata.name, "customStyle")
      ?? DEFAULT_CUSTOM_PROPERTY_STYLE;
    const customThemes = parseStoredThemes(settings.get("customThemes"));
    const theme = findTheme(settings.get("uiThemeId") ?? DEFAULT_THEME_ID, customThemes);
    const apply = (mode = getHostColorMode()) => this.display.onload(
      customProperties.value,
      customPropertyBlockTypes,
      customStyle,
      markerThemeVariables(theme, mode),
    );

    this.stopColorModeObserver?.();
    apply();
    this.stopColorModeObserver = observeHostColorMode(apply);
  }

  override onunload(): void {
    this.stopColorModeObserver?.();
    this.stopColorModeObserver = undefined;
    this.display.onunload();
  }
}
