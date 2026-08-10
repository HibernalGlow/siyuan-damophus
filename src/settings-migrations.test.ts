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
});
