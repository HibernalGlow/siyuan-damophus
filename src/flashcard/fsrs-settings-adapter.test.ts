import { describe, expect, it, vi } from "vitest";
import {
  applyFsrsWeights,
  previewFsrsWeights,
  type FsrsSettingsApi,
} from "./fsrs-settings-adapter";
import type { SiyuanFlashcardConfig } from "@/api";

const weights = Array.from({ length: 19 }, (_, index) => index + 0.25);

function config(overrides: Partial<SiyuanFlashcardConfig> = {}): SiyuanFlashcardConfig {
  return {
    deck: false,
    heading: true,
    list: true,
    mark: true,
    maximumInterval: 36500,
    newCardLimit: 20,
    requestRetention: 0.9,
    reviewCardLimit: 200,
    reviewMode: 0,
    superBlock: true,
    weights: weights.join(", "),
    ...overrides,
  };
}

describe("FSRS settings adapter", () => {
  it("previews old and new 19-weight vectors without writing", () => {
    const api = { current: () => config() } as FsrsSettingsApi;
    const preview = previewFsrsWeights(weights.map((value) => value + 1), api);
    expect(preview.current[0]).toBe(0.25);
    expect(preview.optimized[0]).toBe(1.25);
  });

  it("preserves every other flashcard setting and verifies the persisted weights", async () => {
    const original = config({ requestRetention: 0.87, maximumInterval: 1234, customFutureField: "keep" });
    const optimized = weights.map((value) => value + 1);
    let persisted = original;
    const updateLocal = vi.fn();
    const api: FsrsSettingsApi = {
      current: () => original,
      set: vi.fn(async (next) => {
        persisted = next;
        return next;
      }),
      reread: async () => persisted,
      updateLocal,
    };
    await applyFsrsWeights(optimized, api);
    expect(api.set).toHaveBeenCalledWith(expect.objectContaining({
      requestRetention: 0.87,
      maximumInterval: 1234,
      customFutureField: "keep",
    }));
    expect(persisted.weights.split(",")).toHaveLength(19);
    expect(updateLocal).toHaveBeenCalledWith(persisted);
  });

  it("fails when SiYuan rereads a different parameter vector", async () => {
    const original = config();
    const api: FsrsSettingsApi = {
      current: () => original,
      set: async (next) => next,
      reread: async () => config({ weights: Array(19).fill(9).join(",") }),
      updateLocal: vi.fn(),
    };
    await expect(applyFsrsWeights(weights.map((value) => value + 2), api)).rejects.toThrow("did not persist");
  });
});
