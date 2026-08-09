import { describe, expect, it, vi } from "vitest";
import { registerPluginModels } from "./plugin-models";
import { beginSubPlugin, unloadSubPlugin } from "./plugin-lifecycle";
import type { SubPlugin } from "./types/plugin";

describe("plugin model registration", () => {
  it("registers host models even when a sub-plugin is disabled", () => {
    const registerModels = vi.fn();
    const plugin: SubPlugin = {
      name: "__model-registration-test__",
      enabled: false,
      registerModels,
      onload() {},
      onunload() {},
    };
    registerPluginModels([plugin], vi.fn());

    expect(registerModels).toHaveBeenCalledOnce();
  });

  it("continues registering other models after one registration fails", () => {
    const error = new Error("registration failed");
    const onError = vi.fn();
    const nextRegistration = vi.fn();

    registerPluginModels([
      { name: "broken", registerModels: () => { throw error; }, onload() {}, onunload() {} },
      { name: "healthy", registerModels: nextRegistration, onload() {}, onunload() {} },
    ], onError);

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ name: "broken" }), error);
    expect(nextRegistration).toHaveBeenCalledOnce();
  });
});

describe("sub-plugin enabled lifecycle", () => {
  it("updates the runtime enabled flag before loading and unloading", async () => {
    const plugin: SubPlugin = {
      name: "__enabled-lifecycle-test__",
      enabled: false,
      onload: vi.fn(function (this: SubPlugin) {
        expect(this.enabled).toBe(true);
      }),
      onunload: vi.fn(function (this: SubPlugin) {
        expect(this.enabled).toBe(false);
      }),
    };

    await beginSubPlugin(plugin);
    expect(plugin.enabled).toBe(true);
    expect(plugin.onload).toHaveBeenCalledOnce();

    unloadSubPlugin(plugin);
    expect(plugin.enabled).toBe(false);
    expect(plugin.onunload).toHaveBeenCalledOnce();
  });
});
