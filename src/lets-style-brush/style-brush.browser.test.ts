import { afterEach, describe, expect, it } from "vitest";
import {
  applyWithFormatPainter,
  findSameTextMatches,
  loadedHeadingScopeBlockIds,
  nearestLoadedHeadingId,
  rangeForTextMatch,
  type FormatPainterRuntime,
} from "./style-brush";

const IDS = {
  heading: "20260812100000-aaaaaaa",
  list: "20260812100001-bbbbbbb",
  item: "20260812100002-ccccccc",
  paragraph: "20260812100003-ddddddd",
  nextHeading: "20260812100004-eeeeeee",
  outside: "20260812100005-fffffff",
};

function renderEditor(): HTMLElement {
  document.body.innerHTML = `
    <div data-testid="editor">
      <div data-node-id="${IDS.heading}" data-type="NodeHeading"><div contenteditable="true">Section</div></div>
      <div data-node-id="${IDS.list}" data-type="NodeList">
        <div data-node-id="${IDS.item}" data-type="NodeListItem">
          <div data-node-id="${IDS.paragraph}" data-type="NodeParagraph"><div contenteditable="true">target text</div></div>
        </div>
      </div>
      <div data-node-id="${IDS.nextHeading}" data-type="NodeHeading"><div contenteditable="true">Next</div></div>
      <div data-node-id="${IDS.outside}" data-type="NodeParagraph"><div contenteditable="true">target text</div></div>
    </div>
  `;
  return document.querySelector<HTMLElement>('[data-testid="editor"]')!;
}

function renderMatchingEditor(): HTMLElement {
  const editor = document.createElement("div");
  editor.className = "protyle-wysiwyg";
  editor.innerHTML = `
    <div data-node-id="20260812090000-aaaaaaa" data-type="NodeParagraph">
      <div contenteditable="true">same text / <span data-type="strong">same</span> text</div>
    </div>
    <div data-node-id="20260812090001-bbbbbbb" data-type="NodeParagraph">
      <div contenteditable="true">same text</div>
    </div>
  `;
  document.body.append(editor);
  return editor;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("same-text painter heading scope", () => {
  it("finds the preceding loaded heading when breadcrumbs have no heading", () => {
    const editor = renderEditor();
    expect(nearestLoadedHeadingId(editor, IDS.paragraph)).toBe(IDS.heading);
  });

  it("includes nested text blocks under heading child containers only", () => {
    const editor = renderEditor();
    const allowedIds = loadedHeadingScopeBlockIds(editor, IDS.heading, [IDS.list]);

    expect(allowedIds).toEqual(new Set([
      IDS.heading,
      IDS.list,
      IDS.item,
      IDS.paragraph,
    ]));
    expect(findSameTextMatches(editor, "target text", allowedIds).map((match) => match.blockId))
      .toEqual([IDS.paragraph]);
  });
});

describe("same-text range matching", () => {
  it("finds literal matches across adjacent inline nodes", () => {
    const matches = findSameTextMatches(renderMatchingEditor(), "same text");
    expect(matches).toHaveLength(3);
    expect(matches.map((match) => rangeForTextMatch(match)?.toString()))
      .toEqual(["same text", "same text", "same text"]);
  });

  it("limits matching to allowed heading block IDs", () => {
    const matches = findSameTextMatches(
      renderMatchingEditor(),
      "same text",
      new Set(["20260812090001-bbbbbbb"]),
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].blockId).toBe("20260812090001-bbbbbbb");
  });

  it("delegates every other match to Format Painter in reverse DOM order", () => {
    const editor = renderMatchingEditor();
    const allMatches = findSameTextMatches(editor, "same text");
    const sourceRange = rangeForTextMatch(allMatches[0]);
    expect(sourceRange).toBeDefined();
    const matches = findSameTextMatches(editor, "same text", undefined, sourceRange);
    const calls: string[] = [];
    const runtime = {
      name: "siyuan-plugin-formatPainter",
      formatPainterEnable: false,
      formatData: null,
      getSelectedParentHtml: () => null,
    } satisfies FormatPainterRuntime;
    const listener = () => {
      if (!runtime.formatPainterEnable) return;
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
      const element = range?.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer as Element
        : range?.startContainer.parentElement;
      calls.push(`${element?.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId}:${selection?.toString()}`);
    };
    document.addEventListener("mouseup", listener);

    const applied = applyWithFormatPainter(
      runtime,
      {} as Parameters<typeof applyWithFormatPainter>[1],
      { datatype: "strong", style: "color: red" },
      matches,
    );

    document.removeEventListener("mouseup", listener);
    expect(applied).toBe(2);
    expect(calls).toEqual([
      "20260812090001-bbbbbbb:same text",
      "20260812090000-aaaaaaa:same text",
    ]);
    expect(runtime.formatPainterEnable).toBe(false);
    expect(runtime.formatData).toBeNull();
    expect(document.body.dataset.formatPainterEnable).toBe("false");
    expect(window.getSelection()?.rangeCount).toBe(0);
  });
});
