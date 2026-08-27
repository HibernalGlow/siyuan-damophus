import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearReviewToolbarActions,
  getReviewToolbarAction,
  getReviewToolbarActionRevision,
  registerReviewToolbarAction,
} from "./review-action-registry";

afterEach(() => clearReviewToolbarActions());

describe("review toolbar action registry", () => {
  it("registers and disposes actions for other modules", async () => {
    const execute = vi.fn();
    const action = {
      id: "topic-relations.open",
      icon: "iconLink",
      label: "打开考点关系",
      source: "topic-relations",
      execute,
    } as const;
    const before = getReviewToolbarActionRevision();
    const dispose = registerReviewToolbarAction(action);

    expect(getReviewToolbarAction("topic-relations.open")).toBe(action);
    expect(getReviewToolbarActionRevision()).toBeGreaterThan(before);
    await getReviewToolbarAction("topic-relations.open")?.execute({
      root: {} as HTMLElement,
      toolbar: {} as HTMLElement,
      trigger: {} as Element,
      documentRef: {} as Document,
      resolveCard: async () => undefined,
      click: () => false,
    });
    expect(execute).toHaveBeenCalledTimes(1);

    dispose();
    expect(getReviewToolbarAction("topic-relations.open")).toBeUndefined();
  });

  it("rejects accidental action ID replacement", () => {
    const action = { id: "topic-relations.open", icon: "iconLink", label: "打开考点关系", execute: vi.fn() };
    registerReviewToolbarAction(action);
    expect(() => registerReviewToolbarAction(action)).toThrow("already registered");
  });
});
