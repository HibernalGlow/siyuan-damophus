import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SelectionHighlightPlugin from "./index";
import pluginMetadata from "./plugin";
import {
  SELECTION_FOCUS_HIGHLIGHT,
  SELECTION_HIGHLIGHT_STYLE_ID,
  SELECTION_RESULTS_HIGHLIGHT,
  SelectionHighlighter,
} from "./selection-highlight";

function renderEditor(): { editor: HTMLElement; scroller: HTMLElement } {
  const scroller = document.createElement("div");
  scroller.className = "protyle-content";
  const editor = document.createElement("div");
  editor.className = "protyle-wysiwyg";
  editor.innerHTML = "<p>Alpha beta</p><p>alpha <strong>be</strong>ta alpha</p>";
  scroller.append(editor);
  document.body.append(scroller);
  scroller.scrollBy = vi.fn();
  return { editor, scroller };
}

function selectText(node: Text, start: number, end: number): void {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

function highlightRanges(name: string): Range[] {
  return [...(CSS.highlights.get(name) ?? [])]
    .filter((range): range is Range => range instanceof Range);
}

function pressNavigation(shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    code: "KeyP",
    key: "p",
    ctrlKey: true,
    altKey: true,
    shiftKey,
  });
  document.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  CSS.highlights.clear();
  document.body.replaceChildren();
  document.getElementById(SELECTION_HIGHLIGHT_STYLE_ID)?.remove();
  window.getSelection()?.removeAllRanges();
});

afterEach(() => {
  CSS.highlights.clear();
  document.body.replaceChildren();
  document.getElementById(SELECTION_HIGHLIGHT_STYLE_ID)?.remove();
  window.getSelection()?.removeAllRanges();
});

describe("selection highlighting", () => {
  it("highlights case-insensitive matches including text split across nodes", () => {
    const { editor } = renderEditor();
    const firstText = editor.querySelector("p")!.firstChild as Text;
    selectText(firstText, 0, 10);

    const highlighter = new SelectionHighlighter();
    highlighter.start();
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    const ranges = highlightRanges(SELECTION_RESULTS_HIGHLIGHT);
    expect(ranges).toHaveLength(2);
    expect(ranges.map((range) => range.toString())).toEqual(["Alpha beta", "alpha beta"]);
    expect(document.getElementById(SELECTION_HIGHLIGHT_STYLE_ID)).not.toBeNull();
    highlighter.destroy();
  });

  it("inherits result and focus colors from the active SiYuan theme", () => {
    const highlighter = new SelectionHighlighter();
    highlighter.start();

    const css = document.getElementById(SELECTION_HIGHLIGHT_STYLE_ID)?.textContent ?? "";
    expect(css).toContain("background-color: var(--b3-theme-primary-lighter)");
    expect(css).toContain("color: var(--b3-theme-on-background)");
    expect(css).toContain("background-color: var(--b3-theme-primary)");
    expect(css).toContain("color: var(--b3-theme-on-primary)");
    expect(css).not.toMatch(/#39c5bb|#66ccff|#000/iu);

    highlighter.destroy();
  });

  it("reuses the cached document scan while navigating forward and backward", () => {
    const { editor, scroller } = renderEditor();
    const firstText = editor.querySelector("p")!.firstChild as Text;
    selectText(firstText, 0, 5);
    const treeWalkerSpy = vi.spyOn(document, "createTreeWalker");

    const highlighter = new SelectionHighlighter();
    highlighter.start();
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(treeWalkerSpy).toHaveBeenCalledTimes(1);

    const nextEvent = pressNavigation();
    expect(nextEvent.defaultPrevented).toBe(true);
    expect(highlightRanges(SELECTION_FOCUS_HIGHLIGHT)[0].toString()).toBe("alpha");
    expect(treeWalkerSpy).toHaveBeenCalledTimes(1);

    pressNavigation(true);
    expect(highlightRanges(SELECTION_FOCUS_HIGHLIGHT)[0].toString()).toBe("Alpha");
    expect(treeWalkerSpy).toHaveBeenCalledTimes(1);
    expect(scroller.scrollBy).toHaveBeenCalledTimes(2);

    highlighter.destroy();
    treeWalkerSpy.mockRestore();
  });

  it("rebuilds lazily after editor content changes", async () => {
    const { editor } = renderEditor();
    const firstText = editor.querySelector("p")!.firstChild as Text;
    selectText(firstText, 0, 5);
    const treeWalkerSpy = vi.spyOn(document, "createTreeWalker");

    const highlighter = new SelectionHighlighter();
    highlighter.start();
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    editor.append(document.createTextNode(" alpha"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(treeWalkerSpy).toHaveBeenCalledTimes(1);
    pressNavigation();
    expect(treeWalkerSpy).toHaveBeenCalledTimes(2);
    expect(highlightRanges(SELECTION_RESULTS_HIGHLIGHT)).toHaveLength(4);

    highlighter.destroy();
    treeWalkerSpy.mockRestore();
  });

  it("removes only Damophus highlights and listeners when unloaded", () => {
    const { editor } = renderEditor();
    const text = editor.querySelector("p")!.firstChild as Text;
    CSS.highlights.set("another-module", new Highlight());
    selectText(text, 0, 5);

    const plugin = new SelectionHighlightPlugin();
    plugin.getSetting = () => true;
    plugin.onload();
    plugin.onload();
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(highlightRanges(SELECTION_RESULTS_HIGHLIGHT)).toHaveLength(3);

    plugin.onunload();
    expect(CSS.highlights.has("another-module")).toBe(true);
    expect(CSS.highlights.has(SELECTION_RESULTS_HIGHLIGHT)).toBe(false);
    expect(document.getElementById(SELECTION_HIGHLIGHT_STYLE_ID)).toBeNull();

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(CSS.highlights.has(SELECTION_RESULTS_HIGHLIGHT)).toBe(false);
  });

  it("toggles highlighting immediately from the Damophus menu", () => {
    const { editor } = renderEditor();
    const text = editor.querySelector("p")!.firstChild as Text;
    selectText(text, 0, 5);
    let highlightEnabled = true;
    const setSetting = vi.fn((key: string, value: boolean) => {
      if (key === "highlightEnabled") highlightEnabled = value;
    });
    const plugin = new SelectionHighlightPlugin();
    plugin.getSetting = () => highlightEnabled;
    plugin.setSetting = setSetting;
    plugin.t = () => "Selection highlighting";
    plugin.onload();

    const addItem = vi.fn();
    plugin.addMenuItem({ addItem } as never);
    const enabledItem = addItem.mock.calls[0][0];
    expect(enabledItem).toMatchObject({
      icon: "iconMark",
      label: "Selection highlighting",
      checked: true,
    });

    enabledItem.click();
    expect(setSetting).toHaveBeenLastCalledWith("highlightEnabled", false);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(CSS.highlights.has(SELECTION_RESULTS_HIGHLIGHT)).toBe(false);

    addItem.mockClear();
    plugin.addMenuItem({ addItem } as never);
    const disabledItem = addItem.mock.calls[0][0];
    expect(disabledItem.checked).toBe(false);
    disabledItem.click();
    expect(setSetting).toHaveBeenLastCalledWith("highlightEnabled", true);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(highlightRanges(SELECTION_RESULTS_HIGHLIGHT)).toHaveLength(3);

    plugin.onunload();
  });

  it("declares the menu-controlled setting as enabled by default", () => {
    expect(pluginMetadata.settings).toContainEqual(expect.objectContaining({
      key: "highlightEnabled",
      type: "checkbox",
      value: true,
    }));
  });
});
