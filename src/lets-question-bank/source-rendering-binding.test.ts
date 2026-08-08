import { describe, expect, it, vi } from "vitest";
import { initialized } from "../question-bank/adapters/siyuan/siyuan-adapter.fixtures";
import { resolveSourceRenderingBinding } from "./source-rendering-binding";

describe("source rendering binding", () => {
  it("keeps the SiYuan scratch-document metadata available after the TinyBase cutover", async () => {
    const { binding } = await initialized();
    const setSetting = vi.fn();

    expect(resolveSourceRenderingBinding(
      (key) => key === "binding" ? binding : undefined,
      setSetting,
    )).toEqual(binding);
    expect(setSetting).not.toHaveBeenCalled();
  });
});
