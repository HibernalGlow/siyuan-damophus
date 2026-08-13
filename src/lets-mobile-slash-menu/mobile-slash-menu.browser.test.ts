import { afterEach, describe, expect, it, vi } from "vitest";
import { type MobileSlashMenuRuntime, MobileSlashMenuShortcut } from "./mobile-slash-menu";

afterEach(() => {
  document.body.innerHTML = "";
  document.getSelection()?.removeAllRanges();
});

function placeCaretAtEnd(element: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return range;
}

function renderEditor() {
  document.body.innerHTML = `<div id="sidebar"></div><div class="protyle-wysiwyg">
    <div data-node-id="block" contenteditable="true">note<span data-type="text"></span></div>
  </div>`;
  const editable = document.querySelector<HTMLElement>("[contenteditable='true']")!;
  const inline = editable.querySelector<HTMLElement>("span")!;
  const hintElement = document.createElement("div");
  hintElement.className = "protyle-hint fn__none";
  hintElement.innerHTML = '<div class="fn__loading">stale loading</div>';
  document.body.append(hintElement);
  const nativeCommands = [
    { html: "<span>一级标题</span>", value: "heading1", filter: ["heading1", "h1", "一级标题"] },
    { html: "<span>二级标题</span>", value: "heading2", filter: ["heading2", "h2", "二级标题"] },
    { html: "<span>无序列表</span>", value: "list", filter: ["list", "无序列表"] },
  ];
  const slashProvider = vi.fn((key: string) => nativeCommands
    .filter((command) => !key || command.filter.some((value) => value.includes(key))));
  const originalRender = vi.fn(function (this: { element: HTMLElement }, _protyle: unknown) {
    this.element.innerHTML = '<div class="fn__loading">native mobile fallback</div>';
    this.element.classList.remove("fn__none");
  });
  const genHTML = vi.fn(function (this: { element: HTMLElement }, commands: typeof nativeCommands) {
    this.element.innerHTML = commands
      .map((command) => `<button data-id="${command.value}" class="b3-list-item">${command.html}</button>`)
      .join("");
    this.element.classList.toggle("fn__none", commands.length === 0);
  });
  const hint = {
    render: originalRender,
    element: hintElement,
    enableExtend: false,
    enableSlash: false,
    lastIndex: 2,
    splitChar: "((",
    timeId: window.setTimeout(() => undefined, 10_000),
    genHTML,
  };
  const protyle = {
    hint,
    options: { hint: { extend: [{ key: "/", hint: slashProvider }] } },
    toolbar: { range: placeCaretAtEnd(inline) },
    wysiwyg: { element: editable.parentElement! },
  };
  const input = vi.fn(() => hint.render(protyle));
  editable.addEventListener("input", input);
  return {
    editable,
    inline,
    hint,
    hintElement,
    slashProvider,
    originalRender,
    genHTML,
    input,
    protyle,
    runtime: { getEditors: () => [{ protyle }] } satisfies MobileSlashMenuRuntime,
  };
}

function typeText(editor: ReturnType<typeof renderEditor>, value: string) {
  editor.inline.append(value);
  placeCaretAtEnd(editor.inline);
  editor.inline.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    data: value,
    inputType: "insertText",
  }));
}

describe("mobile slash menu shortcut", () => {
  it("opens the complete native menu from direct slash input and filters subsequent text", () => {
    const editor = renderEditor();
    const shortcut = new MobileSlashMenuShortcut(document, editor.runtime);
    shortcut.start();

    expect(document.querySelector("[data-type='add']")).toBeNull();
    expect(document.getElementById("damophus-mobile-slash-menu-style")).not.toBeNull();
    typeText(editor, "/");

    expect(editor.editable.textContent).toBe("note/");
    expect(editor.originalRender).not.toHaveBeenCalled();
    expect(editor.slashProvider).toHaveBeenLastCalledWith("", editor.protyle, "hint");
    expect(editor.hintElement.querySelector(".fn__loading")).toBeNull();
    expect(editor.hintElement.querySelectorAll(".b3-list-item")).toHaveLength(3);
    expect(editor.hintElement.textContent).toContain("一级标题");

    typeText(editor, "h1");
    expect(editor.slashProvider).toHaveBeenLastCalledWith("h1", editor.protyle, "hint");
    expect(editor.hintElement.querySelectorAll(".b3-list-item")).toHaveLength(1);
    expect(editor.hintElement.textContent).toBe("一级标题");
    expect(editor.hint.splitChar).toBe("/");
    expect(editor.hint.lastIndex).toBe(4);

    shortcut.stop();
    expect(document.getElementById("damophus-mobile-slash-menu-style")).toBeNull();
    editor.hint.render(editor.protyle);
    expect(editor.originalRender).toHaveBeenCalledOnce();
  });

  it("leaves non-slash and code contexts on the original native path", () => {
    const editor = renderEditor();
    const shortcut = new MobileSlashMenuShortcut(document, editor.runtime);
    shortcut.start();

    editor.inline.textContent = "plain text";
    placeCaretAtEnd(editor.inline);
    editor.hint.render(editor.protyle);
    expect(editor.originalRender).toHaveBeenCalledOnce();

    editor.inline.dataset.type = "code";
    editor.inline.textContent = "/h1";
    placeCaretAtEnd(editor.inline);
    editor.hint.render(editor.protyle);
    expect(editor.originalRender).toHaveBeenCalledTimes(2);
    expect(editor.slashProvider).not.toHaveBeenCalled();
  });

  it("keeps desktop slash rendering native and only enhances its resulting menu", () => {
    const editor = renderEditor();
    editor.hint.enableSlash = true;
    editor.originalRender.mockImplementation(function (this: { element: HTMLElement }) {
      (editor.hint.genHTML as unknown as (
        data: Array<{ html: string; value: string }>,
        protyle: typeof editor.protyle,
        escape: boolean,
        source: "hint",
      ) => void)?.([
        { html: '<span class="b3-list-item__graphic"></span><span class="b3-list-item__text">heading</span>', value: "heading1" },
      ], editor.protyle, false, "hint");
    });
    const shortcut = new MobileSlashMenuShortcut(
      document,
      editor.runtime,
      { enableDirectSlash: false },
    );
    shortcut.start();
    typeText(editor, "/");

    expect(editor.originalRender).toHaveBeenCalledOnce();
    expect(editor.slashProvider).not.toHaveBeenCalled();
    expect(editor.hintElement.dataset.damophusMobileSlashMenu).toBe("true");
    const item = editor.hintElement.querySelector(".b3-list-item");
    expect(item?.classList.contains("damophus-slash-item--icon")).toBe(true);
    expect(item?.getAttribute("title")).toBe("heading");
  });

  it("attaches editors delivered by the SiYuan event bus and restores their native render", () => {
    const shortcut = new MobileSlashMenuShortcut(document, { getEditors: () => [] });
    shortcut.start();
    const render = vi.fn();
    const wysiwyg = document.createElement("div");
    const protyle = { hint: { render }, wysiwyg: { element: wysiwyg } };

    shortcut.attach(protyle);
    expect(wysiwyg.dataset.damophusMobileSlashMenu).toBe("true");
    shortcut.detach(protyle);
    expect(wysiwyg.hasAttribute("data-damophus-mobile-slash-menu")).toBe(false);
    shortcut.stop();
    protyle.hint.render(protyle);
    expect(render).toHaveBeenCalledOnce();
  });
});
