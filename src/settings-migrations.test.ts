import { describe, expect, it } from "vitest";
import type { PluginMetadata } from "@/types/plugin";
import { migrateLegacyModuleSettings } from "./settings-migrations";

const pluginConfigs: PluginMetadata[] = [{
  name: "mobileAppearance",
  displayName: "lets-mobile-appearance.displayName",
  enabled: true,
  legacyEnabledSetting: "showMobileAppearanceShortcut",
}];

describe("legacy module settings migration", () => {
  it("moves a legacy root switch into the module enabled state", () => {
    const config = { showMobileAppearanceShortcut: false };

    expect(migrateLegacyModuleSettings(config, pluginConfigs)).toBe(true);
    expect(config).toEqual({ mobileAppearance: { enabled: false } });
  });

  it("preserves an existing module state and removes the stale root switch", () => {
    const config = {
      showMobileAppearanceShortcut: false,
      mobileAppearance: { enabled: true },
    };

    expect(migrateLegacyModuleSettings(config, pluginConfigs)).toBe(true);
    expect(config).toEqual({ mobileAppearance: { enabled: true } });
  });

  it("does nothing when the legacy setting is absent", () => {
    const config = { mobileAppearance: { enabled: false } };

    expect(migrateLegacyModuleSettings(config, pluginConfigs)).toBe(false);
    expect(config).toEqual({ mobileAppearance: { enabled: false } });
  });

  it("moves the removed mobile title-path module into mobile appearance", () => {
    const config = { mobileTitlePath: { enabled: true } };

    expect(migrateLegacyModuleSettings(config, pluginConfigs)).toBe(true);
    expect(config).toEqual({ mobileAppearance: { enabled: true, titlePath: true } });
  });

  it("moves smart Callout insertion from appearance to Callout tools", () => {
    const config = {
      calloutAppearance: { enabled: true, smartInsert: false, paddingTop: 16 },
      calloutTools: { enabled: true, smartInsert: true, blockMenuConversion: true },
    };

    expect(migrateLegacyModuleSettings(config, pluginConfigs)).toBe(true);
    expect(config).toEqual({
      calloutAppearance: { enabled: true, paddingTop: 16 },
      calloutTools: { enabled: true, smartInsert: false, blockMenuConversion: true },
    });
  });
});
