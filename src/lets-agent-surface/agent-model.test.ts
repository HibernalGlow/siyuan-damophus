import { describe, expect, it, vi } from "vitest";
import {
  applyConfiguredAgentModel,
  configuredAgentModelId,
  resolveAgentModel,
  type AgentModel,
} from "./agent-model";

describe("native Agent model adapter", () => {
  it("uses an existing native model without activating its Dock", async () => {
    const panelElement = {} as HTMLElement;
    const model: AgentModel = { panelElement };
    const activate = vi.fn();
    const wait = vi.fn(async () => undefined);

    await expect(resolveAgentModel({ resolve: () => model, activate, wait })).resolves.toEqual({
      model,
      created: false,
    });
    expect(activate).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
  });

  it("returns a synchronously created model without waiting for a render frame", async () => {
    const panelElement = {} as HTMLElement;
    const model: AgentModel = { panelElement };
    let current: AgentModel | undefined;
    const wait = vi.fn(async () => undefined);

    await expect(resolveAgentModel({
      resolve: () => current,
      activate: () => {
        current = model;
      },
      wait,
    })).resolves.toEqual({ model, created: true });
    expect(wait).not.toHaveBeenCalled();
  });

  it("keeps the bounded retry path for asynchronously created models", async () => {
    const panelElement = {} as HTMLElement;
    const model: AgentModel = { panelElement };
    let current: AgentModel | undefined;
    const wait = vi.fn(async () => {
      current = model;
    });

    await expect(resolveAgentModel({
      resolve: () => current,
      activate: vi.fn(),
      wait,
    })).resolves.toEqual({ model, created: true });
    expect(wait).toHaveBeenCalledOnce();
    expect(wait).toHaveBeenCalledWith(25);
  });

  it("applies SiYuan's configured Agent model through the native validator", () => {
    const applySessionModelIfValid = vi.fn();
    const model: AgentModel = {
      panelElement: {} as HTMLElement,
      applySessionModelIfValid,
    };
    const config = { agent: { modelId: "configured-model" } };

    expect(configuredAgentModelId(config)).toBe("configured-model");
    expect(applyConfiguredAgentModel(model, config)).toBe(true);
    expect(applySessionModelIfValid).toHaveBeenCalledWith("configured-model");
  });
});
