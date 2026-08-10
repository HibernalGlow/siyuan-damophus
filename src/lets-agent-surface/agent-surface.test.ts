import { describe, expect, it } from "vitest";
import agentSurfaceStyles from "./agent-surface.css?raw";
import pluginMetadata from "./plugin";
import {
  isAgentMenuTarget,
  isMobileAgentEntryTarget,
  resolveAgentSurface,
  selectedBlockIds,
  shouldOpenInNewTab,
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

  it("shares one opener while selecting platform-specific surfaces", () => {
    expect(resolveAgentSurface("desktop", true)).toBe("desktop-tab");
    expect(resolveAgentSurface("browser-desktop", false)).toBe("desktop-native");
    expect(resolveAgentSurface("mobile", true)).toBe("mobile-dropdown");
    expect(resolveAgentSurface("browser-mobile", false)).toBe("mobile-dropdown");
  });

  it("uses one boolean setting to switch native and tab opening", () => {
    const toggle = pluginMetadata.settings?.find((setting) => setting.key === "openInNewTab");
    expect(toggle).toMatchObject({ type: "checkbox", value: true });
    expect(pluginMetadata.settings?.some((setting) => setting.key === "displayMode")).toBe(false);
  });

  it("maps the removed floating mode to native while preserving tab upgrades", () => {
    expect(shouldOpenInNewTab(false, "tab")).toBe(false);
    expect(shouldOpenInNewTab(undefined, "floating")).toBe(false);
    expect(shouldOpenInNewTab(undefined, "tab")).toBe(true);
    expect(shouldOpenInNewTab(undefined)).toBe(true);
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
