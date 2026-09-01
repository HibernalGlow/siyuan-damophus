import { describe, expect, it } from "vitest";
import { enforceSourceBlockReadOnly, observeFocusedBlock } from "./source/source-embed-presentation";

describe("source embed read-only enforcement", () => {
  it("locks existing and dynamically rendered editable descendants", async () => {
    const root = document.createElement("div");
    const existing = document.createElement("span");
    existing.contentEditable = "true";
    root.append(existing);

    const stop = enforceSourceBlockReadOnly(root);
    expect(existing.contentEditable).toBe("false");

    const dynamic = document.createElement("span");
    dynamic.contentEditable = "true";
    root.append(dynamic);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dynamic.contentEditable).toBe("false");

    stop();
    const afterStop = document.createElement("span");
    afterStop.contentEditable = "true";
    root.append(afterStop);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(afterStop.contentEditable).toBe("true");
  });

  it("retains a focused heading and its sibling-rendered source subtree", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="answer-heading">答案与解析</div>
      <div data-node-id="answer-list">答案 ABC</div>
      <div data-node-id="answer-callout">解析正文</div>
      <div data-node-id="next-question">下一题</div>
    `;

    const stop = observeFocusedBlock(root, "answer-heading", [
      "answer-heading",
      "answer-list",
      "answer-callout",
    ]);

    expect(root.querySelector('[data-node-id="answer-heading"]')).not.toBeNull();
    expect(root.querySelector('[data-node-id="answer-list"]')).not.toBeNull();
    expect(root.querySelector('[data-node-id="answer-callout"]')).not.toBeNull();
    expect(root.querySelector('[data-node-id="next-question"]')).toBeNull();

    root.insertAdjacentHTML("beforeend", '<div data-node-id="unrelated-late">无关内容</div>');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelector('[data-node-id="unrelated-late"]')).toBeNull();
    stop();
  });

  it("prunes full-document cb-get-all output around a nested stem paragraph", async () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="question-heading">
        <div data-node-id="question-list">
          <div data-node-id="question-item">
            <div data-node-id="stem">Question stem</div>
            <div data-node-id="options"><div data-node-id="option-a">A. First</div></div>
          </div>
        </div>
      </div>
      <div data-node-id="answer-heading">
        <div data-node-id="answer-body">Answer</div>
      </div>
      <div data-node-id="next-question">Next question</div>
    `;

    const stop = observeFocusedBlock(root, "stem", ["stem"]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(root.querySelector('[data-node-id="stem"]')).not.toBeNull();
    expect(root.querySelector('[data-node-id="question-item"]')).not.toBeNull();
    expect(root.querySelector('[data-node-id="options"]')).toBeNull();
    expect(root.querySelector('[data-node-id="answer-heading"]')).toBeNull();
    expect(root.querySelector('[data-node-id="next-question"]')).toBeNull();
    stop();
  });
});
