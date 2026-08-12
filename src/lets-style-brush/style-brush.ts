import type { IProtyle } from "siyuan";

export const FORMAT_PAINTER_PLUGIN_NAME = "siyuan-plugin-formatPainter";
export type StyleBrushScope = "document" | "heading";

export interface FormatPainterData {
  datatype: string | null;
  style: string | null;
}

export interface FormatPainterRuntime {
  name: string;
  formatPainterEnable: boolean;
  formatData: FormatPainterData | null;
  protyle?: IProtyle;
  getSelectedParentHtml(): FormatPainterData | null;
}

export interface TextMatch {
  editable: HTMLElement;
  blockId: string;
  start: number;
  end: number;
}

interface TextSegment {
  node: Text;
  start: number;
  end: number;
  boundaries: number[];
}

const NODE_ID_PATTERN = /^\d{14}-[a-z0-9]{7}$/u;
const ZWSP_PATTERN = /\u200b/gu;
const EXCLUDED_TEXT_SELECTOR = [
  ".protyle-attr",
  ".protyle-action",
  '[data-type="NodeCodeBlock"]',
  '[contenteditable="false"]',
].join(",");

export function normalizeSelectedText(value: string): string {
  return value.replace(ZWSP_PATTERN, "");
}

export function selectedRangeBlockId(range: Range): string | undefined {
  const element = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer as Element
    : range.startContainer.parentElement;
  const id = element?.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId;
  return typeof id === "string" && NODE_ID_PATTERN.test(id) ? id : undefined;
}

export function nearestHeadingId(
  sourceBlockId: string,
  sourceIsHeading: boolean,
  breadcrumbs: Array<{ id: string; type: string }>,
  loadedHeadingId?: string,
): string | undefined {
  if (sourceIsHeading) return sourceBlockId;
  for (let index = breadcrumbs.length - 1; index >= 0; index -= 1) {
    const item = breadcrumbs[index];
    if (item?.type === "h" || item?.type === "NodeHeading") return item.id;
  }
  return loadedHeadingId;
}

export function nearestLoadedHeadingId(
  editor: HTMLElement,
  sourceBlockId: string,
): string | undefined {
  let nearest: string | undefined;
  for (const element of editor.querySelectorAll<HTMLElement>("[data-node-id]")) {
    const id = element.dataset.nodeId;
    if (id === sourceBlockId) return nearest;
    if (element.dataset.type !== "NodeHeading") continue;
    if (element.closest(".bq, .callout-content, [data-type=\"NodeList\"]")) continue;
    nearest = id;
  }
  return undefined;
}

export function loadedHeadingScopeBlockIds(
  editor: HTMLElement,
  headingId: string,
  headingChildIds: Iterable<string>,
): Set<string> {
  const scopeRoots = new Set([headingId, ...headingChildIds]);
  const allowedIds = new Set(scopeRoots);

  editor.querySelectorAll<HTMLElement>("[data-node-id]").forEach((element) => {
    const id = element.dataset.nodeId;
    if (!id || allowedIds.has(id)) return;
    let ancestor = element.parentElement?.closest<HTMLElement>("[data-node-id]");
    while (ancestor && editor.contains(ancestor)) {
      if (scopeRoots.has(ancestor.dataset.nodeId ?? "")) {
        allowedIds.add(id);
        return;
      }
      ancestor = ancestor.parentElement?.closest<HTMLElement>("[data-node-id]");
    }
  });

  return allowedIds;
}

function textMap(editable: HTMLElement): { text: string; segments: TextSegment[] } {
  const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
  const segments: TextSegment[] = [];
  let text = "";
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    const parent = textNode.parentElement;
    if (parent && !parent.closest(EXCLUDED_TEXT_SELECTOR)) {
      const raw = textNode.data;
      const boundaries = [0];
      let normalized = "";
      for (let index = 0; index < raw.length; index += 1) {
        if (raw[index] === "\u200b") continue;
        normalized += raw[index];
        boundaries.push(index + 1);
      }
      if (normalized) {
        const start = text.length;
        text += normalized;
        segments.push({ node: textNode, start, end: text.length, boundaries });
      }
    }
    node = walker.nextNode();
  }
  return { text, segments };
}

function rangeFromMap(segments: TextSegment[], start: number, end: number): Range | undefined {
  const startSegment = segments.find((segment) => start >= segment.start && start < segment.end);
  const endSegment = segments.find((segment) => end > segment.start && end <= segment.end);
  if (!startSegment || !endSegment) return undefined;
  const range = document.createRange();
  range.setStart(
    startSegment.node,
    startSegment.boundaries[start - startSegment.start] ?? 0,
  );
  range.setEnd(
    endSegment.node,
    endSegment.boundaries[end - endSegment.start] ?? endSegment.node.length,
  );
  return range;
}

function rangesEqual(left: Range, right: Range): boolean {
  return left.compareBoundaryPoints(Range.START_TO_START, right) === 0
    && left.compareBoundaryPoints(Range.END_TO_END, right) === 0;
}

export function findSameTextMatches(
  editor: HTMLElement,
  selectedText: string,
  allowedBlockIds?: ReadonlySet<string>,
  sourceRange?: Range,
): TextMatch[] {
  const needle = normalizeSelectedText(selectedText);
  if (!needle) return [];
  const matches: TextMatch[] = [];
  const seenEditables = new Set<HTMLElement>();

  editor.querySelectorAll<HTMLElement>('[contenteditable="true"]').forEach((editable) => {
    if (seenEditables.has(editable)) return;
    seenEditables.add(editable);
    const blockId = editable.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId;
    if (!blockId || (allowedBlockIds && !allowedBlockIds.has(blockId))) return;
    const map = textMap(editable);
    let start = map.text.indexOf(needle);
    while (start >= 0) {
      const end = start + needle.length;
      const range = rangeFromMap(map.segments, start, end);
      if (range && (!sourceRange || !rangesEqual(range, sourceRange))) {
        matches.push({ editable, blockId, start, end });
      }
      start = map.text.indexOf(needle, end);
    }
  });

  return matches;
}

export function rangeForTextMatch(match: TextMatch): Range | undefined {
  return rangeFromMap(textMap(match.editable).segments, match.start, match.end);
}

export function findFormatPainter(protyle: IProtyle): FormatPainterRuntime | undefined {
  const runtime = (protyle.app.plugins.find(
    (item) => item.name === FORMAT_PAINTER_PLUGIN_NAME,
  ) as unknown as Partial<FormatPainterRuntime> | undefined);
  if (!runtime || typeof runtime.getSelectedParentHtml !== "function") return undefined;
  return runtime as FormatPainterRuntime;
}

export function restoreSelection(range: Range): void {
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function captureFormatPainterData(
  runtime: FormatPainterRuntime,
  protyle: IProtyle,
  sourceRange: Range,
): FormatPainterData | null {
  restoreSelection(sourceRange);
  runtime.protyle = protyle;
  const data = runtime.getSelectedParentHtml();
  runtime.formatPainterEnable = false;
  document.body.dataset.formatPainterEnable = "false";
  return data ? { datatype: data.datatype, style: data.style } : null;
}

export function applyWithFormatPainter(
  runtime: FormatPainterRuntime,
  protyle: IProtyle,
  data: FormatPainterData | null,
  matches: TextMatch[],
): number {
  runtime.protyle = protyle;
  runtime.formatData = data;
  runtime.formatPainterEnable = true;
  document.body.dataset.formatPainterEnable = "true";
  let applied = 0;
  try {
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const range = rangeForTextMatch(matches[index]);
      if (!range) continue;
      restoreSelection(range);
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      applied += 1;
    }
  } finally {
    runtime.formatPainterEnable = false;
    runtime.formatData = null;
    document.body.dataset.formatPainterEnable = "false";
    document.querySelector<HTMLElement>(".siyuan-plugin-formatPainter_brush_indicator")
      ?.style.setProperty("display", "none");
    window.getSelection()?.removeAllRanges();
  }
  return applied;
}
