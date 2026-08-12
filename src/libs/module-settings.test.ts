import { describe, expect, it } from "vitest";
import type { PluginMetadata } from "@/types/plugin";
import { buildModuleSettings, MODULE_ENABLED_SETTING_KEY } from "./module-settings";

describe("module settings model", () => {
  it("gives every module a settings group with an enabled switch and icon", () => {
    const modules: PluginMetadata[] = [
      {
        name: "emptyModule",
        displayName: "empty.displayName",
        enabled: true,
        icon: "bot",
      },
      {
        name: "configuredModule",
        displayName: "configured.displayName",
        enabled: true,
        icon: "brain",
        settings: [
          { type: "checkbox", key: "entryMenu", title: "Menu", value: true, entrySurface: "menu", entryManagement: "central" },
          { type: "checkbox", key: "entryTab", title: "Tab", value: false, entrySurface: "tab", entryManagement: "central" },
          { type: "checkbox", key: "extra", title: "Extra", value: false },
        ],
        declarations: [{
          id: "source",
          title: "Source",
          children: [{
            id: "mask",
            title: "Mask",
            settings: [{ type: "checkbox", key: "nested", title: "Nested", value: true, menu: true }],
          }],
        }],
      },
    ];
    const stored = new Map<string, unknown>([["emptyModule.enabled", false]]);
    const model = buildModuleSettings(
      modules,
      (moduleName, key, fallback) => stored.get(`${moduleName}.${key}`) ?? fallback,
    );

    expect(model.switches).toEqual([
      expect.objectContaining({ key: "emptyModule", value: false, icon: "bot", hasSetting: true }),
      expect.objectContaining({ key: "configuredModule", value: true, icon: "brain", hasSetting: true }),
    ]);
    expect(model.groups["empty.displayName"]).toEqual([
      expect.objectContaining({ key: MODULE_ENABLED_SETTING_KEY, value: false, icon: "bot" }),
    ]);
    expect(model.groups["configured.displayName"].map((item) => item.key)).toEqual([
      MODULE_ENABLED_SETTING_KEY,
      "extra",
      "nested",
    ]);
    expect(model.entries).toEqual([
      expect.objectContaining({
        pluginName: "configuredModule",
        group: "configured.displayName",
        icon: "brain",
        surfaces: {
          menu: expect.objectContaining({ key: "entryMenu", value: true }),
          tab: expect.objectContaining({ key: "entryTab", value: false }),
        },
      }),
    ]);
  });

  it("uses a stable fallback icon when a module has not declared one yet", () => {
    const model = buildModuleSettings([
      { name: "agentSurface", displayName: "agent.displayName" },
      { name: "unknown", displayName: "unknown.displayName" },
    ], (_moduleName, _key, fallback) => fallback);

    expect(model.switches.map((item) => item.icon)).toEqual(["sparkles", "film"]);
    expect(model.entries).toEqual([]);
  });
});
