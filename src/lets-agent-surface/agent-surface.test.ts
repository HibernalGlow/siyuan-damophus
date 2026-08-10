import { describe, expect, it } from "vitest";
import agentSurfaceStyles from "./agent-surface.css?raw";
import pluginMetadata from "./plugin";
import {
  displayMode,
  isAgentMenuTarget,
  isMobileAgentEntryTarget,
  resolveAgentSurface,
  selectedBlockIds,
} from "./surface-helpers";

describe("agent surface helpers", () => {
  it("declares centrally managed menu and tab entry points", () => {
    const entrySettings = pluginMetadata.settings?.filter((setting) => setting.entryManagement === "central");
    expect(entrySettings?.map((setting) => [setting.entrySurface, setting.value])).toEqual([
      ["menu", true],
      ["tab", true],
    ]);
  });

  it("keeps the native mobile model close transform available", () => {
    expect(agentSurfaceStyles).not.toContain("transform: translateX(0)");
  });

  it("normalizes unknown display modes to the floating surface", () => {
    expect(displayMode("floating")).toBe("floating");
    expect(displayMode("tab")).toBe("tab");
    expect(displayMode("native")).toBe("floating");
  });

  it("shares one opener while selecting platform-specific surfaces", () => {
    expect(resolveAgentSurface("desktop", "tab")).toBe("desktop-tab");
    expect(resolveAgentSurface("browser-desktop", "floating")).toBe("desktop-floating");
    expect(resolveAgentSurface("mobile", "tab")).toBe("mobile-dropdown");
    expect(resolveAgentSurface("browser-mobile", "floating")).toBe("mobile-dropdown");
  });

  it("recognizes the native Add to Agent menu item", () => {
    const selected = { closest: () => ({}) };
    const unrelated = { closest: () => null };
    expect(isAgentMenuTarget(selected as unknown as EventTarget)).toBe(true);
    expect(isAgentMenuTarget(unrelated as unknown as EventTarget)).toBe(false);
  });

  it("recognizes the native mobile Agent entry", () => {
    const selected = { closest: (selector: string) => selector === "#menuAgentChat" ? {} : null };
    const unrelated = { closest: () => null };
    expect(isMobileAgentEntryTarget(selected as unknown as EventTarget)).toBe(true);
    expect(isMobileAgentEntryTarget(unrelated as unknown as EventTarget)).toBe(false);
  });

  it("reads selected block references without duplicating ids", () => {
    const root = {
      querySelectorAll: () => [
        { dataset: { nodeId: "block-a" } },
        { dataset: { nodeId: "block-a" } },
        { dataset: { nodeId: "block-b" } },
      ],
    } as unknown as ParentNode;
    expect(selectedBlockIds(root)).toEqual(["block-a", "block-b"]);
  });
});
