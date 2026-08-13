import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type MobileSlashMenuRuntime,
  MOBILE_SLASH_MENU_ATTRIBUTE,
  MobileSlashMenuShortcut,
} from "./mobile-slash-menu";

afterEach(() => {
  document.body.innerHTML = "";
});

interface TestEditor {
  nativeAdd: ReturnType<typeof vi.fn>;
  nativeButton: HTMLButtonElement;
  editable: HTMLElement;
  hintElement: HTMLElement;
  hintRender: ReturnType<typeof vi.fn>;
  deliverStaleHintResult: () => void;
  input: ReturnType<typeof vi.fn>;
  runtime: MobileSlashMenuRuntime;
}

function renderEditor(): TestEditor {
  document.body.innerHTML = `<div id="sidebar"></div><div id="keyboardToolbar">
    <div class="keyboard__bar">
      <button class="keyboard__action" data-type="add"><svg><use xlink:href="#iconAdd"></use></svg></button>
    </div>
  </div><div class="protyle-wysiwyg"><div data-node-id="block" contenteditable="true">note</div></div>`;
  const toolbar = document.querySelector<HTMLElement>("#keyboardToolbar")!;
  const nativeButton = document.querySelector<HTMLButtonElement>('.keyboard__action[data-type="add"]')!;
  const editable = document.querySelector<HTMLElement>('[contenteditable="true"]')!;
  const range = document.createRange();
  range.selectNodeContents(editable);
  range.collapse(false);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);

  const hintElement = document.createElement("div");
  hintElement.className = "protyle-hint";
  hintElement.innerHTML = '<div class="fn__loading">stale loading</div>';
  document.body.append(hintElement);
  const hintRender = vi.fn(function (this: {
    element: HTMLElement;
    genHTML?: (value: string) => void;
    lastIndex: number;
    splitChar: string;
  }, _protyle: unknown) {
    expect(document.getElementById("sidebar")).toBeNull();
    const text = editable.textContent ?? "";
    const slashIndex = text.lastIndexOf("/");
    this.splitChar = slashIndex >= 0 ? "/" : "";
    this.lastIndex = slashIndex;
    const key = slashIndex >= 0 ? text.slice(slashIndex + 1) : "";
    this.genHTML?.(`command:${key}`);
  });
  const hint = {
    element: hintElement,
    enableExtend: false,
    enableSlash: false,
    lastIndex: 3,
    splitChar: "((",
    timeId: window.setTimeout(() => undefined, 10_000),
    genHTML(this: { element: HTMLElement }, value: unknown) {
      this.element.innerHTML = `<button class="b3-list-item">${String(value)}</button>`;
      this.element.classList.remove("fn__none");
    },
    render: hintRender,
  };
  const protyle = {
    hint,
    toolbar: { range },
    wysiwyg: { element: editable.parentElement! },
  };
  const input = vi.fn(() => hint.render(protyle));
  editable.addEventListener("input", input);
  const nativeAdd = vi.fn();
  toolbar.addEventListener("click", nativeAdd);
  return {
    nativeAdd,
    nativeButton,
    editable,
    deliverStaleHintResult: () => hint.genHTML("stale reference result"),
    hintElement,
    hintRender,
    input,
    runtime: { getEditors: () => [{ protyle }] },
  };
}

describe("mobile slash menu shortcut", () => {
  it("reuses the native add button and opens a filterable slash hint without stale loading", () => {
    const editor = renderEditor();
    const originalButton = editor.nativeButton;
    const shortcut = new MobileSlashMenuShortcut(document, editor.runtime);

    shortcut.start("Insert / and open slash menu");

    expect(document.querySelectorAll('#keyboardToolbar [data-type="add"]')).toHaveLength(1);
    expect(document.querySelector('#keyboardToolbar [data-type="damophus-slash-menu"]')).toBeNull();
    expect(editor.nativeButton).toBe(originalButton);
    expect(editor.nativeButton.querySelector("use")?.getAttribute("xlink:href")).toBe("#iconAdd");
    expect(editor.nativeButton.getAttribute(MOBILE_SLASH_MENU_ATTRIBUTE)).toBe("true");

    editor.nativeButton.click();

    expect(editor.nativeAdd).not.toHaveBeenCalled();
    expect(editor.editable.textContent).toBe("note/");
    expect(editor.input).toHaveBeenCalledOnce();
    expect(editor.hintRender).toHaveBeenCalledTimes(2);
    expect(editor.hintElement.querySelector(".fn__loading")).toBeNull();
    expect(editor.hintElement.textContent).toBe("command:");
    editor.deliverStaleHintResult();
    expect(editor.hintElement.textContent).toBe("command:");

    document.execCommand("insertText", false, "ta");
    expect(editor.editable.textContent).toBe("note/ta");
    expect(editor.hintElement.textContent).toBe("command:ta");

    shortcut.stop();
    expect(editor.nativeButton.isConnected).toBe(true);
    expect(editor.nativeButton.hasAttribute(MOBILE_SLASH_MENU_ATTRIBUTE)).toBe(false);
    expect(editor.nativeButton.hasAttribute("aria-label")).toBe(false);
    expect(editor.nativeButton.hasAttribute("title")).toBe(false);
    editor.nativeButton.click();
    expect(editor.nativeAdd).toHaveBeenCalledOnce();
  });

  it("hooks a native add button that SiYuan creates after module startup", async () => {
    document.body.innerHTML = '<div id="keyboardToolbar"><div class="keyboard__bar"></div></div>';
    const shortcut = new MobileSlashMenuShortcut(document, { getEditors: () => [] });
    shortcut.start("Open slash menu");
    const button = document.createElement("button");
    button.className = "keyboard__action";
    button.dataset.type = "add";
    button.innerHTML = '<svg><use xlink:href="#iconAdd"></use></svg>';
    document.querySelector(".keyboard__bar")!.append(button);

    await vi.waitFor(() => expect(button.getAttribute(MOBILE_SLASH_MENU_ATTRIBUTE)).toBe("true"));
    expect(document.querySelectorAll("#keyboardToolbar button")).toHaveLength(1);
    shortcut.stop();
  });
});
