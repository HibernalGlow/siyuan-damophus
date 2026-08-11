import { describe, expect, it, vi } from "vitest";
import pluginMetadata from "./plugin";
import {
  createAgentModeToggle,
  isAgentMenuTarget,
  isMobileAgentEntryTarget,
  resolveAgentSurface,
  selectedBlockIds,
} from "./surface-helpers";

describe("agent surface helpers", () => {
  it("declares centrally managed menu, mobile Dock, and tab entry points", () => {
    const entrySettings = pluginMetadata.settings?.filter((setting) => setting.entryManagement === "central");
    expect(entrySettings?.map((setting) => [setting.entrySurface, setting.value])).toEqual([
      ["menu", true],
      ["mobileDock", true],
      ["tab", true],
    ]);
  });

  it("shares one opener while selecting platform-specific surfaces", () => {
    expect(resolveAgentSurface("desktop", true)).toBe("desktop-tab");
    expect(resolveAgentSurface("browser-desktop", false)).toBe("desktop-native");
    expect(resolveAgentSurface("mobile", true, true)).toBe("mobile-dropdown");
    expect(resolveAgentSurface("browser-mobile", false, false)).toBe("mobile-native");
  });

  it("uses one boolean setting to switch native and tab opening", () => {
    const toggle = pluginMetadata.settings?.find((setting) => setting.key === "openInNewTab");
    expect(toggle).toMatchObject({ type: "checkbox", value: true });
    expect(pluginMetadata.settings?.some((setting) => setting.key === "displayMode")).toBe(false);
  });

  it("adds a menu checkbox that switches mode without opening the Agent", () => {
    const setOpenInNewTab = vi.fn();
    const item = createAgentModeToggle(true, "Open in tab", setOpenInNewTab);
    expect(item).toMatchObject({
      label: "Open in tab",
      checked: true,
    });
    item.click();
    expect(setOpenInNewTab).toHaveBeenCalledWith(false);
  });

  it("declares the mobile dropdown switch", () => {
    expect(pluginMetadata.settings).toContainEqual(expect.objectContaining({
      key: "mobileDropdown",
      type: "checkbox",
      value: true,
    }));
  });

  it("enables YOLO approvals and new-session draft preservation by default", () => {
    expect(pluginMetadata.settings).toContainEqual(expect.objectContaining({
      key: "yoloMode",
      type: "checkbox",
      value: true,
    }));
    expect(pluginMetadata.settings).toContainEqual(expect.objectContaining({
      key: "yoloNotifyBeforeApproval",
      type: "checkbox",
      value: false,
    }));
    expect(pluginMetadata.settings).toContainEqual(expect.objectContaining({
      key: "preserveNewSessionDraft",
      type: "checkbox",
      value: true,
    }));
    expect(pluginMetadata.settings).toContainEqual(expect.objectContaining({
      key: "skipModelSwitchContextConfirmation",
      type: "checkbox",
      value: true,
    }));
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
