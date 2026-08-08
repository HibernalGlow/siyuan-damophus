import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import {
  button,
  blockId,
  documentId,
  dueCard,
  flush,
  makePreview,
  mockController,
  objectiveQuestion,
  option,
  render,
  scan,
  scanAndSync,
} from "./question-bank.browser.fixtures";

describe("question bank scan and import browser flow", () => {
  function topicReadyPreview() {
    const question = {
      ...objectiveQuestion,
      metadata: { ...objectiveQuestion.metadata, topicIds: ["topic-a", "topic-b"] },
    };
    const preview = makePreview([question]);
    preview.actions = [];
    return preview;
  }

  it("keeps portable topic relation synchronization off by default", async () => {
    const { controller, previewTopicRelationSync } = mockController({ preview: topicReadyPreview() });
    render(controller);
    await scan();

    expect(document.body.textContent).toContain("Topic relation sync");
    expect(button("Off").getAttribute("data-state")).toBe("on");
    expect([...document.querySelectorAll("button")].some((item) => item.textContent?.trim() === "Preview topic sync")).toBe(false);
    expect(previewTopicRelationSync).not.toHaveBeenCalled();
  });

  it("previews merge additions and confirms the selected assignments", async () => {
    const relationPreview = {
      token: "merge-token",
      generatedAt: "2026-08-07T12:00:00.000Z",
      mode: "merge" as const,
      assignments: [{ questionId: objectiveQuestion.id, topicIds: ["topic-a", "topic-b"] }],
      actions: [{
        questionId: objectiveQuestion.id,
        currentTopicIds: ["topic-a"],
        incomingTopicIds: ["topic-a", "topic-b"],
        addedTopicIds: ["topic-b"],
        removedTopicIds: [],
        finalTopicIds: ["topic-a", "topic-b"],
      }],
      issues: [],
      results: [],
    };
    const { controller, previewTopicRelationSync, confirmTopicRelationSync } = mockController({
      preview: topicReadyPreview(),
      topicRelationPreview: relationPreview,
      topicRelationConfirmResult: { ...relationPreview, actions: [], results: [{ questionId: objectiveQuestion.id, status: "synced" }] },
    });
    render(controller);
    await scan();

    button("merge").click();
    await flush();
    button("Preview topic sync").click();
    await flush();

    expect(previewTopicRelationSync).toHaveBeenCalledWith(
      [{ questionId: objectiveQuestion.id, topicIds: ["topic-a", "topic-b"] }],
      "merge",
    );
    expect(document.body.textContent).toContain("+topic-b");
    expect(document.body.textContent).toContain("--");

    button("Confirm topic sync").click();
    await flush();
    expect(confirmTopicRelationSync).toHaveBeenCalledWith(
      [{ questionId: objectiveQuestion.id, topicIds: ["topic-a", "topic-b"] }],
      "merge",
      "merge-token",
    );
    expect(document.body.textContent).toContain("synced");
  });

  it("shows diff removals and blocks confirmation when issues exist", async () => {
    const relationPreview = {
      token: "diff-token",
      generatedAt: "2026-08-07T12:00:00.000Z",
      mode: "diff" as const,
      assignments: [{ questionId: objectiveQuestion.id, topicIds: ["topic-a", "topic-b"] }],
      actions: [{
        questionId: objectiveQuestion.id,
        currentTopicIds: ["topic-a", "topic-old"],
        incomingTopicIds: ["topic-a", "topic-b"],
        addedTopicIds: ["topic-b"],
        removedTopicIds: ["topic-old"],
        finalTopicIds: ["topic-a", "topic-b"],
      }],
      issues: [{ code: "unknown-topic-relation-topic", message: "Unknown topic", questionId: objectiveQuestion.id }],
      results: [],
    };
    const { controller, confirmTopicRelationSync } = mockController({
      preview: topicReadyPreview(),
      topicRelationPreview: relationPreview,
    });
    render(controller);
    await scan();

    button("diff").click();
    await flush();
    button("Preview topic sync").click();
    await flush();

    expect(document.body.textContent).toContain("-topic-old");
    expect(document.body.textContent).toContain("Unknown topic");
    expect(button("Confirm topic sync").disabled).toBe(true);
    expect(confirmTopicRelationSync).not.toHaveBeenCalled();
  });

  it("requires question index synchronization before topic relation preview", async () => {
    const { controller, previewTopicRelationSync } = mockController({ preview: makePreview([{
      ...objectiveQuestion,
      metadata: { ...objectiveQuestion.metadata, topicIds: ["topic-a"] },
    }]) });
    render(controller);
    await scan();

    button("merge").click();
    await flush();
    expect(button("Preview topic sync").disabled).toBe(true);
    expect(document.body.textContent).toContain("Synchronize the question index before previewing topic relations");
    expect(previewTopicRelationSync).not.toHaveBeenCalled();
  });

  it("clears a saved heading scope when its block no longer exists", async () => {
    const { controller, saveRecentScope } = mockController({
      recent: { documentId, headingBlockId: "20260804120004-deleted" },
    });
    render(controller);
    await scan();
    expect(document.querySelector('[data-slot="select-trigger"]')?.textContent).toContain("Entire document");
    expect(saveRecentScope).toHaveBeenCalledWith({ documentId });
  });

  it("restores a saved scope by immutable heading block ID", async () => {
    const { controller } = mockController({
      recent: { documentId, headingBlockId: "20260804120003-abcdefg" },
    });
    render(controller);
    await scan();

    expect(document.querySelector('[data-slot="select-trigger"]')?.textContent).toContain("Child topic");
  });

  it("shows concrete scan findings and planned writes", async () => {
    const preview = makePreview([objectiveQuestion]);
    preview.scan.report.inferences = [{
      code: "inferred-question-type",
      message: "Inferred single choice",
      questionId: objectiveQuestion.id,
      line: 12,
      title: "120. （多）",
      sourceMarkdown: "##### 120. （多）",
    }];
    preview.ialWriteActions = [{
      blockId,
      questionId: objectiveQuestion.id,
      line: 12,
      attributes: { "custom-qb-type": "multiple" },
      reason: "inferred-question-type",
    }];
    preview.bindingRepairs = [{
      kind: "add",
      database: "attemptLog",
      field: "duration_ms",
      keyId: "20260804120005-abcdefg",
      name: "Duration (min)",
      type: "number",
    }];
    const { controller } = mockController({ preview });
    render(controller);
    await scan();

    expect(document.body.textContent).toContain("Inferred single choice");
    expect(document.body.textContent).toContain("Heading: 120. （多）");
    expect(document.querySelector(".message-source")?.textContent).toContain("##### 120. （多）");
    expect(document.body.textContent).toContain("custom-qb-type");
    expect(document.body.textContent).toContain("duration_ms");
  });

  it("copies a complete scan log with heading and source Markdown", async () => {
    const preview = makePreview([objectiveQuestion]);
    preview.scan.report.issues = [{
      code: "missing-stable-question-id",
      message: "Question-like heading has no custom-qb-id and was not indexed",
      line: 7,
      title: "99. （单）",
      sourceMarkdown: "##### 99. （单）",
    }];
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const { controller } = mockController({ preview });
    render(controller);
    await scan();

    button("Copy scan log").click();
    await flush();

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Heading: 99. （单）"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("##### 99. （单）"));
  });

  it("discards a scan preview when the target document ID changes", async () => {
    const { controller } = mockController();
    render(controller);
    await scan();
    expect(document.querySelector(".scan-summary")).not.toBeNull();
    const input = document.querySelector<HTMLInputElement>("#document-id");
    if (!input) throw new Error("Missing document input");

    input.value = "20260804120009-changed";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();

    expect(document.querySelector(".scan-summary")).toBeNull();
    expect(document.body.textContent).not.toContain("Start practice");
  });

  it("submits mapped Riff cards when practicing the due filter", async () => {
    const { controller, submitAttempt } = mockController({
      preview: makePreview([objectiveQuestion]),
      dueCards: new Map([[objectiveQuestion.id, dueCard]]),
    });
    render(controller);
    await scanAndSync();
    button("Due").click();
    button("Start practice").click();
    await flush();
    option("Alpha").click();
    option("Gamma").click();
    button("Reveal answer").click();
    await flush();
    button("good").click();
    await flush();
    expect(submitAttempt.mock.calls[0][1]).toEqual(dueCard);
  });

  it("previews attempt imports before confirming writes", async () => {
    const { controller, previewImport, confirmImport } = mockController();
    render(controller);
    const input = document.querySelector<HTMLInputElement>("[data-import-file]");
    if (!input) throw new Error("Missing import input");
    const file = new File(["{}"], "attempts.json", { type: "application/json" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(previewImport).toHaveBeenCalledWith("{}"));
    await flush();
    expect(document.body.textContent).toContain("missing-question");
    button("Confirm import").click();
    await flush();
    expect(confirmImport).toHaveBeenCalledWith("{}", "import-token");
    expect(document.body.textContent).toContain("Imported");
  });

  it("keeps mobile practice controls inside the viewport without overlap", async () => {
    await page.viewport(390, 844);
    const { controller } = mockController({ preview: makePreview([objectiveQuestion]) });
    render(controller);
    await scanAndSync();
    button("Start practice").click();
    await flush();
    option("Alpha").click();
    option("Gamma").click();
    button("Reveal answer").click();
    await flush();
    const controls = [...document.querySelectorAll<HTMLButtonElement>(".rating-bar button")];
    const rects = controls.map((control) => control.getBoundingClientRect());
    expect(controls).toHaveLength(5);
    for (const rect of rects) {
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(390);
      expect(rect.width).toBeGreaterThan(0);
    }
    for (let index = 1; index < rects.length; index += 1) {
      expect(rects[index - 1].right).toBeLessThanOrEqual(rects[index].left);
    }
  });
});
