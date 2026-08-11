import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pluginMetadata from "./plugin";
import {
  DEFAULT_DRAG_OVER_INTERVAL_MS,
  MAX_DRAG_OVER_INTERVAL_MS,
  MIN_DRAG_OVER_INTERVAL_MS,
  NativeBlockDragOverGovernor,
  normalizeDragOverInterval,
} from "./drag-over-governor";

const ORDINARY_BLOCK_DRAG = "application/siyuan-gutternodeparagraph";
const ATTRIBUTE_VIEW_DRAG = "application/siyuan-gutternodeattributeviewrowmenu";

interface EditorFixture {
  editor: HTMLElement;
  firstBlock: HTMLElement;
  secondBlock: HTMLElement;
  firstContent: HTMLElement;
}

function renderEditor(): EditorFixture {
  const protyle = document.createElement("div");
  protyle.className = "protyle";
  const scroller = document.createElement("div");
  scroller.className = "protyle-content";
  scroller.getBoundingClientRect = () => ({
    x: 0,
    y: 100,
    top: 100,
    right: 800,
    bottom: 500,
    left: 0,
    width: 800,
    height: 400,
    toJSON: () => ({}),
  });
  const editor = document.createElement("div");
  editor.className = "protyle-wysiwyg";
  const firstBlock = document.createElement("div");
  firstBlock.dataset.nodeId = "20260811000000-aaaaaaa";
  const firstContent = document.createElement("span");
  firstContent.textContent = "First";
  firstBlock.append(firstContent);
  const secondBlock = document.createElement("div");
  secondBlock.dataset.nodeId = "20260811000001-bbbbbbb";
  secondBlock.textContent = "Second";
  editor.append(firstBlock, secondBlock);
  scroller.append(editor);
  protyle.append(scroller);
  document.body.append(protyle);
  return { editor, firstBlock, secondBlock, firstContent };
}

function dispatchDragOver(
  target: Element,
  type = ORDINARY_BLOCK_DRAG,
  init: DragEventInit = {},
): DragEvent {
  const dataTransfer = new DataTransfer();
  dataTransfer.setData(type, "drag-data");
  const event = new DragEvent("dragover", {
    bubbles: true,
    cancelable: true,
    clientX: 300,
    clientY: 300,
    dataTransfer,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function dispatchDrop(target: Element): DragEvent {
  const dataTransfer = new DataTransfer();
  dataTransfer.setData(ORDINARY_BLOCK_DRAG, "drag-data");
  const event = new DragEvent("drop", {
    bubbles: true,
    cancelable: true,
    clientX: 300,
    clientY: 300,
    dataTransfer,
  });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("native block drag-over governor", () => {
  it("lets the first native event through and suppresses a redundant same-target event", () => {
    const { editor, firstContent } = renderEditor();
    const coreDragOver = vi.fn((event: Event) => event.preventDefault());
    editor.addEventListener("dragover", coreDragOver);
    const governor = new NativeBlockDragOverGovernor(document, () => 100);
    governor.start();

    dispatchDragOver(firstContent);
    const suppressed = dispatchDragOver(firstContent);

    expect(coreDragOver).toHaveBeenCalledOnce();
    expect(suppressed.defaultPrevented).toBe(true);
    governor.destroy();
  });

  it("lets native handling run immediately when the target or modifiers change", () => {
    const { editor, firstContent, secondBlock } = renderEditor();
    const coreDragOver = vi.fn();
    editor.addEventListener("dragover", coreDragOver);
    const governor = new NativeBlockDragOverGovernor(document, () => 100);
    governor.start();

    dispatchDragOver(firstContent);
    dispatchDragOver(secondBlock);
    dispatchDragOver(secondBlock, ORDINARY_BLOCK_DRAG, { ctrlKey: true });

    expect(coreDragOver).toHaveBeenCalledTimes(3);
    governor.destroy();
  });

  it("lets periodic same-target updates reach SiYuan", () => {
    const { editor, firstContent } = renderEditor();
    const coreDragOver = vi.fn();
    editor.addEventListener("dragover", coreDragOver);
    let now = 100;
    const governor = new NativeBlockDragOverGovernor(document, () => now);
    governor.start(DEFAULT_DRAG_OVER_INTERVAL_MS);

    dispatchDragOver(firstContent);
    now += DEFAULT_DRAG_OVER_INTERVAL_MS - 1;
    dispatchDragOver(firstContent);
    now += 1;
    dispatchDragOver(firstContent);

    expect(coreDragOver).toHaveBeenCalledTimes(2);
    governor.destroy();
  });

  it("never intercepts the native drop after a throttled drag update", () => {
    const { editor, firstContent } = renderEditor();
    const coreDragOver = vi.fn();
    const coreDrop = vi.fn((event: Event) => event.preventDefault());
    editor.addEventListener("dragover", coreDragOver);
    editor.addEventListener("drop", coreDrop);
    const governor = new NativeBlockDragOverGovernor(document, () => 100);
    governor.start();

    dispatchDragOver(firstContent);
    dispatchDragOver(firstContent);
    const drop = dispatchDrop(firstContent);

    expect(coreDragOver).toHaveBeenCalledOnce();
    expect(coreDrop).toHaveBeenCalledOnce();
    expect(drop.defaultPrevented).toBe(true);
    governor.destroy();
  });

  it("does not throttle attribute-view drags or drops over a database", () => {
    const { editor, firstBlock, firstContent } = renderEditor();
    const database = document.createElement("div");
    database.className = "av";
    firstBlock.append(database);
    const coreDragOver = vi.fn();
    editor.addEventListener("dragover", coreDragOver);
    const governor = new NativeBlockDragOverGovernor(document, () => 100);
    governor.start();

    dispatchDragOver(firstContent, ATTRIBUTE_VIEW_DRAG);
    dispatchDragOver(firstContent, ATTRIBUTE_VIEW_DRAG);
    dispatchDragOver(database);
    dispatchDragOver(database);

    expect(coreDragOver).toHaveBeenCalledTimes(4);
    governor.destroy();
  });

  it("keeps native auto-scroll updates unthrottled near editor edges", () => {
    const { editor, firstContent } = renderEditor();
    const coreDragOver = vi.fn();
    editor.addEventListener("dragover", coreDragOver);
    const governor = new NativeBlockDragOverGovernor(document, () => 100);
    governor.start();

    dispatchDragOver(firstContent, ORDINARY_BLOCK_DRAG, { clientY: 110 });
    dispatchDragOver(firstContent, ORDINARY_BLOCK_DRAG, { clientY: 110 });

    expect(coreDragOver).toHaveBeenCalledTimes(2);
    governor.destroy();
  });

  it("removes capture listeners when the submodule is disabled", () => {
    const { editor, firstContent } = renderEditor();
    const coreDragOver = vi.fn();
    editor.addEventListener("dragover", coreDragOver);
    const governor = new NativeBlockDragOverGovernor(document, () => 100);
    governor.start();
    governor.destroy();

    dispatchDragOver(firstContent);
    dispatchDragOver(firstContent);

    expect(coreDragOver).toHaveBeenCalledTimes(2);
  });
});

describe("block drag performance settings", () => {
  it("clamps the configurable interval to a conservative range", () => {
    expect(normalizeDragOverInterval(undefined)).toBe(DEFAULT_DRAG_OVER_INTERVAL_MS);
    expect(normalizeDragOverInterval(1)).toBe(MIN_DRAG_OVER_INTERVAL_MS);
    expect(normalizeDragOverInterval("32")).toBe(32);
    expect(normalizeDragOverInterval(200)).toBe(MAX_DRAG_OVER_INTERVAL_MS);
  });

  it("registers as an opt-in submodule", () => {
    expect(pluginMetadata).toMatchObject({
      name: "blockDragPerformance",
      enabled: false,
    });
    expect(pluginMetadata.settings).toContainEqual(expect.objectContaining({
      key: "minimumIntervalMs",
      type: "number",
      value: DEFAULT_DRAG_OVER_INTERVAL_MS,
    }));
  });
});
