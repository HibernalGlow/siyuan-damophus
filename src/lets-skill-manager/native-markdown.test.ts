import { afterEach, describe, expect, it, vi } from "vitest";
import { renderSkillMarkdown } from "./native-markdown";

describe("renderSkillMarkdown", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses SiYuan Lute to produce native block DOM", () => {
    const lute = {
      SetProtyleWYSIWYG: vi.fn(),
      SetKramdownIAL: vi.fn(),
      SetTextMark: vi.fn(),
      SetTag: vi.fn(),
      SetSuperBlock: vi.fn(),
      SetInlineMath: vi.fn(),
      SetGFMStrikethrough: vi.fn(),
      SetSanitize: vi.fn(),
      Md2BlockDOM: vi.fn(() => '<div data-node-id="native">Rendered</div>'),
    };
    vi.stubGlobal("window", { Lute: { New: vi.fn(() => lute) } });

    expect(renderSkillMarkdown("# Native")).toContain('data-node-id="native"');
    expect(lute.SetProtyleWYSIWYG).toHaveBeenCalledWith(true);
    expect(lute.SetSanitize).toHaveBeenCalledWith(true);
    expect(lute.Md2BlockDOM).toHaveBeenCalledWith("# Native");
  });
});
