import { describe, expect, it } from "vitest";
import { launchBlockIdFromElements, validLaunchBlockId } from "./launch-target";

function element(nodeId?: string): { dataset: { nodeId?: string } } {
  return { dataset: { nodeId } };
}

describe("question bank launch targets", () => {
  it("accepts a SiYuan block ID from one selected menu element", () => {
    expect(launchBlockIdFromElements([element("20260804120000-abcdefg")]))
      .toBe("20260804120000-abcdefg");
  });

  it("does not guess a target when multiple blocks are selected", () => {
    expect(launchBlockIdFromElements([
      element("20260804120000-abcdefg"),
      element("20260804120001-abcdefg"),
    ])).toBeUndefined();
  });

  it("rejects missing and malformed block IDs", () => {
    expect(validLaunchBlockId(undefined)).toBeUndefined();
    expect(validLaunchBlockId("not-a-block-id")).toBeUndefined();
    expect(launchBlockIdFromElements([element("20260804120000-ABCDEF!")])).toBeUndefined();
  });
});
