import { describe, expect, it } from "vitest";
import {
  questionBankCustomTabId,
  questionBankTabTarget,
  questionBankTabType,
} from "./tab-contract";

describe("question bank custom tab contract", () => {
  it("prefixes the registered tab type directly with the plugin name", () => {
    expect(questionBankTabType).toBe("question-bank");
    expect(questionBankCustomTabId("siyuan-damophus")).toBe("siyuan-damophusquestion-bank");
  });

  it("keeps the registered tab id fixed and passes the launch block as data", () => {
    expect(questionBankTabTarget("siyuan-damophus", "20260804120000-abcdefg")).toEqual({
      id: "siyuan-damophusquestion-bank",
      data: { documentId: "20260804120000-abcdefg" },
    });
  });
});
