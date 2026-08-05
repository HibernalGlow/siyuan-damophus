import { describe, expect, it } from "vitest";
import { questionBankCustomTabId, questionBankTabType } from "./tab-contract";

describe("question bank custom tab contract", () => {
  it("prefixes the registered tab type directly with the plugin name", () => {
    expect(questionBankTabType).toBe("question-bank");
    expect(questionBankCustomTabId("siyuan-damophus")).toBe("siyuan-damophusquestion-bank");
  });

  it("keeps question-bank tabs distinct for different launch blocks", () => {
    expect(questionBankCustomTabId("siyuan-damophus", "20260804120000-abcdefg"))
      .toBe("siyuan-damophusquestion-bank-20260804120000-abcdefg");
  });
});
