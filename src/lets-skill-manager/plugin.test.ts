import { describe, expect, it } from "vitest";
import { resolveSiyuanPluginIcon } from "../libs/plugin-icons";

import pluginMetadata, { skillManagerAppearance } from "./plugin";

describe("skill manager settings", () => {
  it("uses a dedicated icon distinct from the agent surface", () => {
    expect(skillManagerAppearance.icon).toBe("brain");
    expect(resolveSiyuanPluginIcon(skillManagerAppearance.icon)).toBe("iconBrain");
    expect(resolveSiyuanPluginIcon(skillManagerAppearance.icon)).not.toBe("iconSparkles");
    expect(pluginMetadata.displayName).toBe(skillManagerAppearance.displayName);
    expect(pluginMetadata.icon).toBe(skillManagerAppearance.icon);
  });

  it("configures desktop and mobile Dock visibility independently", () => {
    const settings = new Map(pluginMetadata.settings?.map((setting) => [setting.key, setting]));
    expect(settings.get("entryDesktopDock")).toMatchObject({ type: "checkbox", value: true });
    expect(settings.get("entryMobileDock")).toMatchObject({ type: "checkbox", value: true });
    expect(settings.get("entryDesktopDock")).toMatchObject({ entryManagement: "central" });
    expect(settings.get("entryMobileDock")).toMatchObject({ entryManagement: "central" });
    expect(settings.has("entryDock")).toBe(false);
  });

  it("uses ChezMoi as the primary synchronization backend", () => {
    const backend = pluginMetadata.settings?.find((setting) => setting.key === "syncBackend");
    expect(backend).toMatchObject({
      type: "select",
      value: "chezmoi",
      options: {
        chezmoi: "lets-skill-manager.syncBackendChezmoi",
        builtin: "lets-skill-manager.syncBackendBuiltin",
      },
    });
  });
});
