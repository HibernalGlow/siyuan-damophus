import { describe, expect, it } from "vitest";
import { hideTrailingQuestionTypeMarker } from "./question-bank-display";

describe("hideTrailingQuestionTypeMarker", () => {
  it.each([
    ["2015-3-82，多。", "2015-3-82"],
    ["2015-3-82（单）", "2015-3-82"],
    ["2015-3-82，单选题", "2015-3-82"],
    ["多选题", ""],
    ["关于合同效力的判断", "关于合同效力的判断"],
  ])("normalizes %s", (input, expected) => {
    expect(hideTrailingQuestionTypeMarker(input)).toBe(expected);
  });
});
