import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { addCommand, commands, showMessage } = vi.hoisted(() => {
  const commands: Array<{ langKey?: string }> = [];
  return {
    commands,
    addCommand: vi.fn((command: { langKey?: string }) => {
      commands.push(command);
    }),
    showMessage: vi.fn(),
  };
});

vi.mock("siyuan", () => ({ showMessage }));
vi.mock("../utils", () => ({
  plugin: { addCommand, commands },
}));

import RemoteAccessPlugin from "./index";

function installModule(entryOverrides: Record<string, boolean> = {}) {
  const module = new RemoteAccessPlugin();
  module.name = "remoteAccess";
  module.enabled = true;
  module.t = (key) => key;
  module.getSetting = (key) =>
    Object.prototype.hasOwnProperty.call(entryOverrides, key)
      ? entryOverrides[key]
      : key === "entryCommand" || key === "entryMenu"
        ? true
        : key === "publicHost"
          ? ""
          : undefined;
  module.setSetting = vi.fn();
  return module;
}

function stubServe(enabled = true) {
  vi.stubGlobal("window", {
    siyuan: {
      config: {
        system: { networkServe: enabled, networkServeTLS: false, container: "std" },
        serverAddrs: ["http://127.0.0.1:6806"],
      },
    },
    location: { port: "6806" },
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "203.0.113.7" }));
  vi.stubGlobal("navigator", {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
}

describe("remote access module", () => {
  beforeEach(() => {
    addCommand.mockClear();
    showMessage.mockReset();
    commands.length = 0;
    stubServe();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers the copy command on load and removes it on unload", () => {
    const module = installModule();

    module.onload();
    expect(addCommand).toHaveBeenCalledOnce();
    expect(addCommand.mock.calls[0][0].langKey).toBe("lets-remote-access.copyRemoteUrl");
    expect(commands).toHaveLength(1);

    module.onDataChanged();
    expect(addCommand).toHaveBeenCalledOnce();

    module.onunload();
    expect(commands).toHaveLength(0);
  });

  it("skips command registration when the command entry is disabled", () => {
    const module = installModule({ entryCommand: false });
    module.onload();
    expect(addCommand).not.toHaveBeenCalled();
  });

  it("adds a menu item that copies the public URL", async () => {
    const module = installModule();
    module.onload();
    const menu = { addItem: vi.fn() };
    module.addMenuItem(menu as never);

    expect(menu.addItem).toHaveBeenCalledOnce();
    const item = menu.addItem.mock.calls[0][0] as { icon?: string; click?: () => void };
    expect(item.icon).toBe("iconLink");

    item.click?.();
    await vi.waitFor(() => expect(showMessage).toHaveBeenCalled());
    expect(showMessage.mock.calls[0][0]).toContain("http://203.0.113.7:6806");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("http://203.0.113.7:6806");
  });

  it("respects the menu entry setting", () => {
    const module = installModule({ entryMenu: false });
    const menu = { addItem: vi.fn() };
    module.addMenuItem(menu as never);
    expect(menu.addItem).not.toHaveBeenCalled();
  });

  it("warns when network serve is disabled", async () => {
    stubServe(false);
    const module = installModule();
    await module.copyRemoteUrl();
    expect(showMessage).toHaveBeenCalledWith("lets-remote-access.serveDisabledMessage", 5000, "error");
  });

  it("copies the manually configured host without detecting", async () => {
    const module = installModule();
    module.getSetting = (key) =>
      key === "publicHost" ? "home.example.com" : module.getSetting(key);
    await module.copyRemoteUrl();
    expect(showMessage.mock.calls[0][0]).toContain("http://home.example.com:6806");
    expect(fetch).not.toHaveBeenCalled();
  });
});
