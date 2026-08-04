import { describe, expect, it } from "vitest";
import { questionBankCustomTabId, questionBankTabType } from "./tab-contract";

describe("question bank custom tab contract", () => {
  it("prefixes the registered tab type directly with the plugin name", () => {
    expect(questionBankTabType).toBe("question-bank");
    expect(questionBankCustomTabId("siyuan-damophus")).toBe("siyuan-damophusquestion-bank");
  });
});
