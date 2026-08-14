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
    { html: '<svg class="b3-list-item__graphic"><use href="#iconHeading1"></use></svg><span>一级标题</span>', value: "heading1", filter: ["heading1", "h1", "一级标题"] },
    { html: '<svg class="b3-list-item__graphic"><use xlink:href="#iconHeading2"></use></svg><span>二级标题</span>', value: "heading2", filter: ["heading2", "h2", "二级标题"] },
    { html: '<span class="b3-list-item__graphic">•</span><span>无序列表</span>', value: "list", filter: ["list", "无序列表"] },
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

    expect(editor.slashProvider).toHaveBeenCalledWith("", editor.protyle, "hint");
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
    expect(editor.slashProvider).toHaveBeenCalledTimes(1);
  });

  it("keeps desktop slash rendering native and enhances its asynchronously generated menu", async () => {
    const editor = renderEditor();
    editor.hint.enableSlash = true;
    editor.originalRender.mockImplementation(function (this: { element: HTMLElement }) {
      window.setTimeout(() => {
        (editor.hint.genHTML as unknown as (
          data: Array<{ html: string; value: string }>,
          protyle: typeof editor.protyle,
          escape: boolean,
          source: "hint",
        ) => void)?.([
          { html: '<span class="b3-list-item__graphic"></span><span class="b3-list-item__text">heading</span>', value: "heading1" },
          { html: '<span class="b3-list-item__graphic"></span><span class="b3-list-item__text">AI</span>', value: "ai" },
        ], editor.protyle, false, "hint");
      }, 0);
    });
    let config = JSON.stringify([
      { id: "heading1", visible: true, display: "icon" },
      { id: "ai", visible: false, display: "icon" },
    ]);
    const shortcut = new MobileSlashMenuShortcut(
      document,
      editor.runtime,
      { enableDirectSlash: false, getConfig: () => config },
    );
    shortcut.start();
    typeText(editor, "/");
    await vi.waitFor(() => expect(editor.genHTML).toHaveBeenCalledOnce());

    expect(editor.originalRender).toHaveBeenCalledOnce();
    expect(editor.slashProvider).toHaveBeenCalledTimes(1);
    expect(editor.hintElement.dataset.damophusMobileSlashMenu).toBe("true");
    expect(editor.hintElement.querySelector("[data-id='ai']")).toBeNull();
    const item = editor.hintElement.querySelector(".b3-list-item");
    expect(item?.classList.contains("damophus-slash-item--icon")).toBe(true);
    expect(item?.getAttribute("title")).toBe("heading");

    const patchedGenHTML = editor.hint.genHTML;
    shortcut.stop();
    expect(editor.hint.genHTML).not.toBe(patchedGenHTML);
  });

  it("contains the native desktop list and its rightmost item within the menu width", () => {
    const editor = renderEditor();
    const nativeStyle = document.createElement("style");
    nativeStyle.textContent = ".protyle-hint > .b3-list { min-width: 960px; }";
    document.head.append(nativeStyle);
    const shortcut = new MobileSlashMenuShortcut(document, editor.runtime, { enableDirectSlash: false });
    shortcut.start();

    editor.hintElement.classList.remove("fn__none");
    editor.hintElement.dataset.damophusMobileSlashMenu = "true";
    editor.hintElement.innerHTML = `<div class="b3-list">
      ${Array.from({ length: 20 }, (_, index) => `
        <button class="b3-list-item damophus-slash-item--full">
          <span class="b3-list-item__first">
            <span class="b3-list-item__graphic">${index + 1}</span>
            <span class="b3-list-item__text">command ${index + 1}</span>
          </span>
        </button>`).join("")}
    </div>`;

    const grid = editor.hintElement.firstElementChild as HTMLElement;
    const items = Array.from(grid.querySelectorAll<HTMLElement>(".b3-list-item"));
    const menuRect = editor.hintElement.getBoundingClientRect();
    const rightmostItem = Math.max(...items.map((item) => item.getBoundingClientRect().right));

    expect(grid.clientWidth).toBeLessThanOrEqual(editor.hintElement.clientWidth - 8);
    expect(grid.scrollWidth).toBeLessThanOrEqual(grid.clientWidth);
    expect(editor.hintElement.scrollWidth).toBeLessThanOrEqual(editor.hintElement.clientWidth);
    expect(rightmostItem).toBeLessThanOrEqual(menuRect.right - 4);

    shortcut.stop();
    nativeStyle.remove();
  });

  it("discovers and persists native commands on startup without editor input", () => {
    const editor = renderEditor();
    let catalog = "[]";
    let config = "[]";
    const onCatalog = vi.fn((value: string) => { catalog = value; });
    const onDiscovered = vi.fn((value: string) => { config = value; });
    const shortcut = new MobileSlashMenuShortcut(document, editor.runtime, {
      enableDirectSlash: true,
      getCatalog: () => catalog,
      onCatalog,
      getConfig: () => config,
      onDiscovered,
    });

    shortcut.start();

    expect(editor.editable.textContent).toBe("note");
    expect(editor.slashProvider).toHaveBeenCalledOnce();
    expect(JSON.parse(catalog)).toHaveLength(3);
    expect(JSON.parse(catalog)).toEqual([
      expect.objectContaining({ id: "heading1", iconId: "iconHeading1", hasIcon: true }),
      expect.objectContaining({ id: "heading2", iconId: "iconHeading2", hasIcon: true }),
      expect.objectContaining({ id: "list", iconText: "•", hasIcon: true }),
    ]);
    expect(JSON.parse(config)).toEqual([
      { id: "heading1", visible: true, display: "icon" },
      { id: "heading2", visible: true, display: "icon" },
      { id: "list", visible: true, display: "icon" },
    ]);
    expect(onCatalog).toHaveBeenCalledOnce();
    expect(onDiscovered).toHaveBeenCalledOnce();
  });

  it("applies visibility changes from the live configuration on the next render", () => {
    const editor = renderEditor();
    let config = JSON.stringify([
      { id: "heading1", visible: true, display: "icon" },
      { id: "heading2", visible: true, display: "icon" },
      { id: "list", visible: true, display: "icon" },
    ]);
    const shortcut = new MobileSlashMenuShortcut(document, editor.runtime, {
      enableDirectSlash: true,
      getConfig: () => config,
    });
    shortcut.start();
    typeText(editor, "/");
    expect(editor.hintElement.querySelectorAll(".b3-list-item")).toHaveLength(3);

    config = JSON.stringify([
      { id: "heading1", visible: false, display: "icon" },
      { id: "heading2", visible: true, display: "icon" },
      { id: "list", visible: true, display: "icon" },
    ]);
    editor.inline.textContent = "/";
    placeCaretAtEnd(editor.inline);
    editor.hint.render(editor.protyle);

    expect(editor.hintElement.querySelector("[data-id='heading1']")).toBeNull();
    expect(editor.hintElement.querySelectorAll(".b3-list-item")).toHaveLength(2);
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
