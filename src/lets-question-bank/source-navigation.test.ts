import { describe, expect, it } from "vitest";
import { questionSourceOpenTarget } from "./source-navigation";

describe("questionSourceOpenTarget", () => {
  it("reuses the current tab when it already shows the source document", () => {
    expect(questionSourceOpenTarget("question", "source-doc", "source-doc")).toEqual({
      doc: {
        id: "question",
        zoomIn: true,
        action: ["cb-get-focus", "cb-get-scroll"],
      },
      openNewTab: false,
    });
  });

  it("opens a new tab when another document or a custom tab is active", () => {
    expect(questionSourceOpenTarget("question", "source-doc", "other-doc").openNewTab).toBe(true);
    expect(questionSourceOpenTarget("question", "source-doc", undefined).openNewTab).toBe(true);
  });
});
