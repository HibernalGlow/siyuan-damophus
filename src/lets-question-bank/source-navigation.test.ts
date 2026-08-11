import { describe, expect, it } from "vitest";
import { questionSourceOpenTarget } from "./source-navigation";

describe("questionSourceOpenTarget", () => {
  it("opens the full source document at the question block without restoring stale scroll", () => {
    expect(questionSourceOpenTarget("question", "source-doc", "source-doc")).toEqual({
      doc: {
        id: "question",
        action: ["cb-get-hl", "cb-get-context", "cb-get-rootscroll"],
      },
      openNewTab: false,
    });
  });

  it("opens a new tab when another document or a custom tab is active", () => {
    expect(questionSourceOpenTarget("question", "source-doc", "other-doc").openNewTab).toBe(true);
    expect(questionSourceOpenTarget("question", "source-doc", undefined).openNewTab).toBe(true);
  });
});
