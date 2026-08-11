import { describe, expect, it } from "vitest";
import { questionSourceOpenTarget } from "./source-navigation";

describe("questionSourceOpenTarget", () => {
  it("focuses the question block without restoring stale document scroll", () => {
    expect(questionSourceOpenTarget("question", "source-doc", "source-doc")).toEqual({
      doc: {
        id: "question",
        zoomIn: true,
        action: ["cb-get-focus", "cb-get-hl", "cb-get-all"],
      },
      openNewTab: false,
    });
  });

  it("opens a new tab when another document or a custom tab is active", () => {
    expect(questionSourceOpenTarget("question", "source-doc", "other-doc").openNewTab).toBe(true);
    expect(questionSourceOpenTarget("question", "source-doc", undefined).openNewTab).toBe(true);
  });
});
