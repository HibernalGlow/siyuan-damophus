import { describe, expect, it, vi } from "vitest";

vi.mock("siyuan", () => ({ getAllEditor: () => [], getFrontend: () => "browser-mobile" }));

import pluginMetadata from "./plugin";
import { isMobileSlashMenuFrontend, supportsMobileSlashMenu } from "./index";

describe("mobile slash menu module", () => {
  it("is an independently switchable module", () => {
    expect(pluginMetadata).toMatchObject({
      name: "mobileSlashMenu",
      enabled: false,
      displayName: "lets-mobile-slash-menu.displayName",
    });
    expect(pluginMetadata.settings?.find((item) => item.key === "mobileEnabled"))
      .toMatchObject({ value: true });
    expect(pluginMetadata.settings?.find((item) => item.key === "desktopEnabled"))
      .toMatchObject({ value: false });
    expect(pluginMetadata.settings?.find((item) => item.key === "mobileMenuConfig"))
      .toMatchObject({ value: "[]" });
    expect(pluginMetadata.settings?.find((item) => item.key === "desktopMenuConfig"))
      .toMatchObject({ value: "[]" });
  });

  it("supports both surfaces while identifying mobile's direct-slash path", () => {
    expect(supportsMobileSlashMenu("mobile")).toBe(true);
    expect(supportsMobileSlashMenu("browser-mobile")).toBe(true);
    expect(supportsMobileSlashMenu("desktop")).toBe(true);
    expect(supportsMobileSlashMenu("browser-desktop")).toBe(true);
    expect(isMobileSlashMenuFrontend("browser-mobile")).toBe(true);
    expect(isMobileSlashMenuFrontend("browser-desktop")).toBe(false);
  });
});
