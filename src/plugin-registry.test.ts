import { describe, expect, it, vi } from "vitest";
import { registerPluginModels } from "./plugin-models";
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
