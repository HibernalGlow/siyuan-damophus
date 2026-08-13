import { describe, expect, it, vi } from "vitest";

vi.mock("siyuan", () => ({ getAllEditor: () => [], getFrontend: () => "browser-mobile" }));

import pluginMetadata from "./plugin";
import { supportsMobileSlashMenu } from "./index";

describe("mobile slash menu module", () => {
  it("is an independently switchable module", () => {
    expect(pluginMetadata).toMatchObject({
      name: "mobileSlashMenu",
      enabled: true,
      displayName: "lets-mobile-slash-menu.displayName",
    });
  });

  it("runs only in native and browser mobile frontends", () => {
    expect(supportsMobileSlashMenu("mobile")).toBe(true);
    expect(supportsMobileSlashMenu("browser-mobile")).toBe(true);
    expect(supportsMobileSlashMenu("desktop")).toBe(false);
    expect(supportsMobileSlashMenu("browser-desktop")).toBe(false);
  });
});
