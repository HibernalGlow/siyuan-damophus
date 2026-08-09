import { describe, expect, it } from "vitest";

import pluginMetadata from "./plugin";

describe("skill manager settings", () => {
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
