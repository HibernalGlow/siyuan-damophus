import { describe, expect, it } from "vitest";
import { inferTopicSubjectId } from "./topic-subjects";

describe("topic subject inference", () => {
  it("uses the longest registered topic ID prefix", () => {
    expect(inferTopicSubjectId("civil-procedure-evidence-determination"))
      .toBe("civil-procedure");
    expect(inferTopicSubjectId("criminal-law-crime-description"))
      .toBe("criminal");
    expect(inferTopicSubjectId("civil-contract-validity"))
      .toBe("civil");
    expect(inferTopicSubjectId("intl-public-sources"))
      .toBe("international-law");
    expect(inferTopicSubjectId("intl-space-territory-border"))
      .toBe("international-law");
    expect(inferTopicSubjectId("admin-law-administrative-act"))
      .toBe("administrative");
    expect(inferTopicSubjectId("company-law-shares"))
      .toBe("commercial-economic");
  });

  it("leaves unknown namespaces unclassified", () => {
    expect(inferTopicSubjectId("unknown-special-topic")).toBeUndefined();
  });
});
