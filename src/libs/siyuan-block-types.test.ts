import { describe, expect, it } from "vitest";
import { normalizeSiyuanBlockTypes } from "./siyuan-block-types";

describe("SiYuan block type selection", () => {
  it("normalizes legacy text, removes unknown values, and preserves catalog order", () => {
    expect(normalizeSiyuanBlockTypes("NodeCodeBlock, NodeParagraph\nNodeCodeBlock NodeUnknown"))
      .toEqual(["NodeParagraph", "NodeCodeBlock"]);
  });

  it("accepts persisted arrays and uses a fallback for missing values", () => {
    expect(normalizeSiyuanBlockTypes(["NodeTable", "NodeHeading"])).toEqual(["NodeHeading", "NodeTable"]);
    expect(normalizeSiyuanBlockTypes(undefined, ["NodeCodeBlock"])).toEqual(["NodeCodeBlock"]);
  });
});
