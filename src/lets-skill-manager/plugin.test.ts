import { describe, expect, it } from "vitest";

import pluginMetadata from "./plugin";

describe("skill manager settings", () => {
  it("configures desktop and mobile Dock visibility independently", () => {
    const settings = new Map(pluginMetadata.settings?.map((setting) => [setting.key, setting]));
    expect(settings.get("entryDesktopDock")).toMatchObject({ type: "checkbox", value: true });
    expect(settings.get("entryMobileDock")).toMatchObject({ type: "checkbox", value: true });
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
