import { describe, expect, it } from "vitest";
import { inferSubjectFromQuestionId, inferTopicSubjectId, resolveTopicSubjectId } from "./topic-subjects";

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

describe("subject metadata resolution", () => {
  it("passes canonical subject ids through", () => {
    expect(resolveTopicSubjectId("administrative")).toBe("administrative");
    expect(resolveTopicSubjectId(" Civil-Procedure ")).toBe("civil-procedure");
  });

  it("maps English subject names onto canonical ids", () => {
    expect(resolveTopicSubjectId("administrative law")).toBe("administrative");
    expect(resolveTopicSubjectId("Civil Law")).toBe("civil");
    expect(resolveTopicSubjectId("criminal law")).toBe("criminal");
    expect(resolveTopicSubjectId("civil procedure")).toBe("civil-procedure");
    expect(resolveTopicSubjectId("criminal procedure")).toBe("criminal-procedure");
    expect(resolveTopicSubjectId("commercial law")).toBe("commercial-economic");
    expect(resolveTopicSubjectId("theory law")).toBe("theory-law");
    expect(resolveTopicSubjectId("international law")).toBe("international-law");
  });

  it("maps Chinese subject names onto canonical ids", () => {
    expect(resolveTopicSubjectId("行政法")).toBe("administrative");
    expect(resolveTopicSubjectId("民法")).toBe("civil");
    expect(resolveTopicSubjectId("民诉")).toBe("civil-procedure");
    expect(resolveTopicSubjectId("刑事诉讼法")).toBe("criminal-procedure");
    expect(resolveTopicSubjectId("商经知")).toBe("commercial-economic");
    expect(resolveTopicSubjectId("理论法")).toBe("theory-law");
    expect(resolveTopicSubjectId("三国法")).toBe("international-law");
  });

  it("returns undefined for blank or unrecognized subjects", () => {
    expect(resolveTopicSubjectId(undefined)).toBeUndefined();
    expect(resolveTopicSubjectId("")).toBeUndefined();
    expect(resolveTopicSubjectId("  ")).toBeUndefined();
    expect(resolveTopicSubjectId("my-custom-subject")).toBeUndefined();
  });
});

describe("question id subject inference", () => {
  it("infers the subject from the id prefix before year and collection tokens", () => {
    expect(inferSubjectFromQuestionId("administrative-law-gold-2013-2-2")).toBe("administrative");
    expect(inferSubjectFromQuestionId("civil-procedure-gold-2016-3-41")).toBe("civil-procedure");
    expect(inferSubjectFromQuestionId("criminal-gold-2019-1-2-2")).toBe("criminal");
    expect(inferSubjectFromQuestionId("civil-gold-2020-2-1-20")).toBe("civil");
    expect(inferSubjectFromQuestionId("intl-public-gold-2021-1-1")).toBe("international-law");
    expect(inferSubjectFromQuestionId("theory-gold-2018-1-2")).toBe("theory-law");
  });

  it("handles ids without year tokens", () => {
    expect(inferSubjectFromQuestionId("civil-gold-q110-n110")).toBe("civil");
    expect(inferSubjectFromQuestionId("administrative-law-real-1")).toBe("administrative");
  });

  it("returns undefined for ids without a subject prefix", () => {
    expect(inferSubjectFromQuestionId("q110-n110")).toBeUndefined();
    expect(inferSubjectFromQuestionId("")).toBeUndefined();
  });
});
