import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pluginMetadata from "./plugin";
import { LegacyBlockSelectionBridge } from "./legacy-block-selection";

interface EditorFixture {
  editor: HTMLElement;
  firstText: HTMLElement;
  firstWrappedText: HTMLElement;
  secondText: HTMLElement;
}

function renderEditor(): EditorFixture {
  const editor = document.createElement("div");
  editor.className = "protyle-wysiwyg";
  editor.getBoundingClientRect = () => ({
    x: 100,
    y: 50,
    top: 50,
    right: 700,
    bottom: 500,
    left: 100,
    width: 600,
    height: 450,
    toJSON: () => ({}),
  });

  const firstBlock = document.createElement("div");
  firstBlock.dataset.nodeId = "20260811000000-aaaaaaa";
  const firstText = document.createElement("span");
  firstText.textContent = "First visual line";
  const firstWrappedText = document.createElement("span");
  firstWrappedText.textContent = "Second visual line in the same block";
  firstBlock.append(firstText, firstWrappedText);

  const secondBlock = document.createElement("div");
  secondBlock.dataset.nodeId = "20260811000001-bbbbbbb";
  const secondText = document.createElement("span");
  secondText.textContent = "Another block";
  secondBlock.append(secondText);
  editor.append(firstBlock, secondBlock);
  document.body.append(editor);
  return { editor, firstText, firstWrappedText, secondText };
}

function renderQuestionBankEditor(contentEditable: "true" | "false"): EditorFixture {
  const host = document.createElement("div");
  host.className = "damophus-native-source-block";
  document.body.append(host);
  const fixture = renderEditor();
  fixture.editor.contentEditable = contentEditable;
  host.append(fixture.editor);
  return fixture;
}

function mouseDown(target: Element, init: MouseEventInit = {}): void {
  target.dispatchEvent(new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    clientX: 280,
    clientY: 120,
    ...init,
  }));
}

function mouseMove(target: Element, init: MouseEventInit = {}): void {
  target.dispatchEvent(new MouseEvent("mousemove", {
    bubbles: true,
    cancelable: true,
    buttons: 1,
    clientX: 300,
    clientY: 180,
    ...init,
  }));
}

beforeEach(() => {
  document.body.replaceChildren();
  document.onmousemove = null;
});

afterEach(() => {
  document.body.replaceChildren();
  document.onmousemove = null;
});

describe("legacy block selection bridge", () => {
  it("keeps drag selection native while the pointer remains in one block", () => {
    const { editor, firstText, firstWrappedText } = renderEditor();
    const paddingMouseDown = vi.fn();
    editor.addEventListener("mousedown", (event) => {
      if (event.target === editor) paddingMouseDown(event);
    });
    const bridge = new LegacyBlockSelectionBridge();
    bridge.start();

    mouseDown(firstText);
    mouseMove(firstWrappedText);

    expect(paddingMouseDown).not.toHaveBeenCalled();
    bridge.destroy();
  });

  it("hands a cross-block drag to SiYuan's native padding selection", () => {
    const { editor, firstText, secondText } = renderEditor();
    let nativeOriginEvent: MouseEvent | undefined;
    const paddingMouseDown = vi.fn((event: MouseEvent) => {
      nativeOriginEvent = event;
      document.onmousemove = vi.fn();
      expect(event.clientX).toBe(101);
      expect(event.clientY).toBe(120);
      expect(event.buttons).toBe(1);
    });
    editor.addEventListener("mousedown", (event) => {
      if (event.target === editor) paddingMouseDown(event as MouseEvent);
    });
    const bridge = new LegacyBlockSelectionBridge();
    bridge.start();

    mouseDown(firstText);
    mouseMove(secondText);
    mouseMove(secondText);

    expect(paddingMouseDown).toHaveBeenCalledOnce();
    expect(nativeOriginEvent?.clientX).toBe(280);
    bridge.destroy();
  });

  it("does not replace modifier-assisted text selections", () => {
    const { editor, firstText, secondText } = renderEditor();
    const paddingMouseDown = vi.fn();
    editor.addEventListener("mousedown", (event) => {
      if (event.target === editor) paddingMouseDown(event);
    });
    const bridge = new LegacyBlockSelectionBridge();
    bridge.start();

    mouseDown(firstText, { altKey: true });
    mouseMove(secondText);
    mouseDown(firstText, { shiftKey: true });
    mouseMove(secondText);

    expect(paddingMouseDown).not.toHaveBeenCalled();
    bridge.destroy();
  });

  it("defers to SiYuan versions that already own content-area block selection", () => {
    const { editor, firstText, secondText } = renderEditor();
    const paddingMouseDown = vi.fn();
    editor.addEventListener("mousedown", (event) => {
      if (event.target === editor) paddingMouseDown(event);
    });
    const bridge = new LegacyBlockSelectionBridge();
    bridge.start();

    mouseDown(firstText);
    document.onmousemove = vi.fn();
    mouseMove(secondText);

    expect(paddingMouseDown).not.toHaveBeenCalled();
    bridge.destroy();
  });

  it.each(["true", "false"] as const)(
    "bridges question-bank native editors with contenteditable=%s when SiYuan installed a drag handler",
    (contentEditable) => {
      const { editor, firstText, secondText } = renderQuestionBankEditor(contentEditable);
      const paddingMouseDown = vi.fn();
      editor.addEventListener("mousedown", (event) => {
        if (event.target === editor) paddingMouseDown(event);
      });
      const bridge = new LegacyBlockSelectionBridge();
      bridge.start();

      mouseDown(firstText);
      document.onmousemove = vi.fn();
      mouseMove(secondText);

      expect(paddingMouseDown).toHaveBeenCalledOnce();
      bridge.destroy();
    },
  );

  it("removes its listeners when disabled", () => {
    const { editor, firstText, secondText } = renderEditor();
    const paddingMouseDown = vi.fn();
    editor.addEventListener("mousedown", (event) => {
      if (event.target === editor) paddingMouseDown(event);
    });
    const bridge = new LegacyBlockSelectionBridge();
    bridge.start();
    bridge.destroy();

    mouseDown(firstText);
    mouseMove(secondText);

    expect(paddingMouseDown).not.toHaveBeenCalled();
  });
});

describe("legacy block selection settings", () => {
  it("registers as an opt-in submodule", () => {
    expect(pluginMetadata).toMatchObject({
      name: "legacyBlockSelection",
      enabled: false,
    });
  });
});
