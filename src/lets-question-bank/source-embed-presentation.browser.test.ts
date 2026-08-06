import { afterEach, describe, expect, it } from "vitest";
import { defocusProtyleEditor, observeFocusedBlock } from "./source-embed-presentation";

afterEach(() => {
  document.body.innerHTML = "";
});

async function flushMutations(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("focused Protyle block isolation", () => {
  it("clears focus and selection inside a mounted Protyle editor", () => {
    const wysiwyg = document.createElement("div");
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    editable.tabIndex = 0;
    editable.textContent = "Question";
    wysiwyg.append(editable);
    document.body.append(wysiwyg);
    editable.focus();

    defocusProtyleEditor(wysiwyg);

    expect(document.activeElement).not.toBe(editable);
    expect(window.getSelection()?.rangeCount ?? 0).toBe(0);
  });

  it("removes sibling blocks appended after the focused block has rendered", async () => {
    const wysiwyg = document.createElement("div");
    wysiwyg.innerHTML = '<div data-node-id="stem"><div data-id="stem-result">Question</div></div>';
    document.body.append(wysiwyg);

    const stop = observeFocusedBlock(wysiwyg, "stem");
    wysiwyg.insertAdjacentHTML(
      "beforeend",
      '<div data-node-id="solution"><div data-id="solution-result">Answer</div></div>',
    );
    await flushMutations();

    expect(wysiwyg.querySelector('[data-node-id="stem"]')).not.toBeNull();
    expect(wysiwyg.querySelector('[data-id="stem-result"]')?.textContent).toBe("Question");
    expect(wysiwyg.querySelector('[data-node-id="solution"]')).toBeNull();
    stop();
  });

  it("keeps the ancestor path for a nested focused block and prunes its siblings", () => {
    const wysiwyg = document.createElement("div");
    wysiwyg.innerHTML = `
      <div data-node-id="list">
        <div data-node-id="stem">Question</div>
        <div data-node-id="other-item">Other</div>
      </div>
      <div data-node-id="outside">Outside</div>
    `;
    document.body.append(wysiwyg);

    const stop = observeFocusedBlock(wysiwyg, "stem");

    expect(wysiwyg.querySelector('[data-node-id="list"]')).not.toBeNull();
    expect(wysiwyg.querySelector('[data-node-id="stem"]')).not.toBeNull();
    expect(wysiwyg.querySelector('[data-node-id="other-item"]')).toBeNull();
    expect(wysiwyg.querySelector('[data-node-id="outside"]')).toBeNull();
    stop();
  });
});
