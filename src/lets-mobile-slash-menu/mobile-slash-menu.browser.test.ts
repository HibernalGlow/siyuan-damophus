import { afterEach, describe, expect, it, vi } from "vitest";
import { type MobileSlashMenuRuntime, MobileSlashMenuShortcut } from "./mobile-slash-menu";

afterEach(() => {
  document.body.innerHTML = "";
});

function renderEditor() {
  document.body.innerHTML = `<div id="sidebar"></div><div class="protyle-wysiwyg">
    <div data-node-id="block" contenteditable="true">note</div>
  </div>`;
  const editable = document.querySelector<HTMLElement>("[contenteditable='true']")!;
  const hintElement = document.createElement("div");
  hintElement.className = "protyle-hint fn__none";
  hintElement.innerHTML = '<div class="fn__loading">stale loading</div>';
  document.body.append(hintElement);
  const gateStates: boolean[] = [];
  const hintRender = vi.fn(function (this: {
    element: HTMLElement;
    genHTML: (value: string) => void;
    lastIndex: number;
    splitChar: string;
  }, _protyle: unknown) {
    // This models the native mobile gate and the desktop slash rendering path.
    const mobileGatePresent = document.getElementById("sidebar") !== null;
    gateStates.push(mobileGatePresent);
    if (mobileGatePresent) return;
    const slashIndex = (editable.textContent ?? "").lastIndexOf("/");
    if (slashIndex < 0) {
      this.element.classList.add("fn__none");
      return;
    }
    this.splitChar = "/";
    this.lastIndex = slashIndex;
    this.genHTML(`command:${(editable.textContent ?? "").slice(slashIndex + 1)}`);
  });
  const hint = {
    render: hintRender,
    element: hintElement,
    enableExtend: false,
    enableSlash: false,
    lastIndex: 2,
    splitChar: "((",
    timeId: window.setTimeout(() => undefined, 10_000),
    genHTML(this: { element: HTMLElement }, value: string) {
      this.element.innerHTML = `<button class="b3-list-item">${value}</button>`;
      this.element.classList.remove("fn__none");
    },
  };
  const range = document.createRange();
  range.selectNodeContents(editable);
  range.collapse(false);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  const protyle = { hint, toolbar: { range }, wysiwyg: { element: editable.parentElement! } };
  const input = vi.fn(() => hint.render(protyle));
  editable.addEventListener("input", input);
  return {
    editable,
    hint,
    gateStates,
    hintElement,
    hintRender,
    input,
    runtime: { getEditors: () => [{ protyle }] } satisfies MobileSlashMenuRuntime,
  };
}

describe("mobile slash menu shortcut", () => {
  it("lets direct slash input open the native filterable menu", () => {
    const editor = renderEditor();
    const shortcut = new MobileSlashMenuShortcut(document, editor.runtime);
    shortcut.start();

    expect(document.querySelector("[data-type='add']")).toBeNull();
    editor.editable.append("/");
    editor.editable.dispatchEvent(new InputEvent("input", { bubbles: true, data: "/", inputType: "insertText" }));

    expect(editor.editable.textContent).toBe("note/");
    expect(editor.input).toHaveBeenCalledOnce();
    expect(editor.hintRender).toHaveBeenCalledOnce();
    expect(editor.hintElement.querySelector(".fn__loading")).toBeNull();
    expect(editor.hintElement.textContent).toBe("command:");
    editor.hint.genHTML("stale async reference result");
    expect(editor.hintElement.textContent).toBe("command:");

    editor.editable.append("ta");
    editor.editable.dispatchEvent(new InputEvent("input", { bubbles: true, data: "ta", inputType: "insertText" }));
    expect(editor.hintElement.textContent).toBe("command:ta");
    expect(editor.gateStates).toEqual([false, false]);

    shortcut.stop();
    editor.hint.genHTML("native async result after unload");
    expect(editor.hintElement.textContent).toBe("native async result after unload");
    editor.editable.append("/");
    editor.editable.dispatchEvent(new InputEvent("input", { bubbles: true, data: "/", inputType: "insertText" }));
    expect(editor.hintRender).toHaveBeenCalledTimes(3);
    expect(editor.gateStates).toEqual([false, false, true]);
  });

  it("patches editors created after module startup and restores their native render", async () => {
    document.body.innerHTML = "<div id='sidebar'></div>";
    const editors: Array<{ protyle: { hint: { render: ReturnType<typeof vi.fn> } } }> = [];
    const shortcut = new MobileSlashMenuShortcut(document, { getEditors: () => editors });
    shortcut.start();
    const gateStates: boolean[] = [];
    const render = vi.fn(() => gateStates.push(document.getElementById("sidebar") !== null));
    editors.push({ protyle: { hint: { render } } });
    document.body.append(document.createElement("div"));
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    editors[0].protyle.hint.render({});
    expect(render).toHaveBeenCalledOnce();
    expect(gateStates).toEqual([false]);
    shortcut.stop();
    document.getElementById("sidebar")!.id = "sidebar";
    editors[0].protyle.hint.render({});
    expect(render).toHaveBeenCalledTimes(2);
    expect(gateStates).toEqual([false, true]);
  });
});
