import { getLogger } from "@/libs/logger";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { settings } from "@/settings";
import { getHostColorMode, markerThemeVariables, observeHostColorMode } from "@/theme/runtime";
import { parseStoredThemes } from "@/theme/schema";
import { DEFAULT_THEME_ID, findTheme } from "@/theme/themes";

import AttributeMarkerDisplay from "./attribute-marker-display";
import {
  DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
  DEFAULT_CUSTOM_PROPERTY_STYLE,
  resolveCustomProperties,
} from "./custom-properties";
import pluginMetadata from "./plugin";

const log = getLogger("lets-block-attr");

export default class BlockAttr extends SubPluginBase {
  private readonly display = new AttributeMarkerDisplay();
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

    const storedBlockTypes = settings.getBySpace(pluginMetadata.name, "customPropertyBlockTypes");
    const customPropertyBlockTypes = typeof storedBlockTypes === "string"
      ? storedBlockTypes
      : DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES;
    const storedCustomStyle = settings.getBySpace(pluginMetadata.name, "customStyle");
    const customStyle = typeof storedCustomStyle === "string"
      ? storedCustomStyle
      : DEFAULT_CUSTOM_PROPERTY_STYLE;
    const customThemes = parseStoredThemes(settings.get("customThemes"));
    const storedThemeId = settings.get("uiThemeId");
    const theme = findTheme(
      typeof storedThemeId === "string" ? storedThemeId : DEFAULT_THEME_ID,
      customThemes,
    );
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
