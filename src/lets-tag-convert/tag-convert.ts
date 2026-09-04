import type { IOperation } from "siyuan";

export type TagConvertFormat = "plain" | "code";

export interface TagConvertOptions {
  format: TagConvertFormat;
  /** Literal text replacing the leading hash mark; may be empty. */
  leftWrap: string;
  /** Literal text replacing the trailing hash mark; may be empty. */
  rightWrap: string;
}

export interface TagConvertPlan {
  doOperations: IOperation[];
  undoOperations: IOperation[];
  tagCount: number;
  blockCount: number;
}

export const DEFAULT_TAG_CONVERT_OPTIONS: TagConvertOptions = {
  format: "plain",
  leftWrap: "",
  rightWrap: "",
};

export function normalizeTagConvertFormat(value: unknown): TagConvertFormat {
  return value === "code" ? "code" : "plain";
}

export function normalizeTagWrap(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Markdown-shaped preview of one conversion for dialog display.
 * The sample content comes from i18n at the call site.
 */
export function previewTagConversion(options: TagConvertOptions, sampleContent: string): string {
  return options.format === "code"
    ? `${options.leftWrap}\`${sampleContent}\`${options.rightWrap}`
    : `${options.leftWrap}${sampleContent}${options.rightWrap}`;
}

/**
 * Strip the surrounding hash marks from a tag text (e.g. "#book/xxx#").
 * Returns null when the text is not hash-wrapped or the content is empty.
 */
export function extractTagContent(text: string): string | null {
  if (text.length < 3 || !text.startsWith("#") || !text.endsWith("#")) return null;
  const content = text.slice(1, -1);
  return content.length > 0 ? content : null;
}

interface BlockConversion {
  dom: string;
  tagCount: number;
}

/**
 * Convert tag spans inside one persisted block DOM. Only spans whose
 * data-type contains "tag" are touched; every other inline element
 * (images, refs, math...) is preserved. Returns null when nothing changed.
 */
export function convertTagsInBlockDom(dom: string, options: TagConvertOptions): BlockConversion | null {
  if (typeof document === "undefined") return null;
  const template = document.createElement("template");
  template.innerHTML = dom;
  const block = template.content.firstElementChild as HTMLElement | null;
  if (!block) return null;

  let tagCount = 0;
  for (const tag of Array.from(block.querySelectorAll<HTMLElement>('[data-type~="tag"]'))) {
    const content = extractTagContent(tag.textContent ?? "");
    if (content === null) continue;
    const replacement: Node[] = [];
    if (options.leftWrap) replacement.push(document.createTextNode(options.leftWrap));
    if (options.format === "code") {
      const codeSpan = document.createElement("span");
      codeSpan.setAttribute("data-type", "code");
      codeSpan.textContent = content;
      replacement.push(codeSpan);
    } else {
      replacement.push(document.createTextNode(content));
    }
    if (options.rightWrap) replacement.push(document.createTextNode(options.rightWrap));
    tag.replaceWith(...replacement);
    tagCount += 1;
  }
  if (tagCount === 0) return null;
  return { dom: block.outerHTML, tagCount };
}

/**
 * Build the document-wide conversion transaction plan. The caller must
 * pre-filter candidate blocks via SQL and supply persisted DOM (getBlockDOM)
 * as the source of truth, mirroring the document-format plugin flow.
 */
export function createTagConvertPlan(
  domById: Readonly<Record<string, string>>,
  options: TagConvertOptions,
): TagConvertPlan {
  const doOperations: IOperation[] = [];
  const undoOperations: IOperation[] = [];
  let tagCount = 0;

  for (const [id, originalDom] of Object.entries(domById)) {
    const conversion = convertTagsInBlockDom(originalDom, options);
    if (conversion === null) continue;
    doOperations.push({ action: "update", id, data: conversion.dom });
    undoOperations.push({ action: "update", id, data: originalDom });
    tagCount += conversion.tagCount;
  }

  return {
    doOperations,
    undoOperations,
    tagCount,
    blockCount: doOperations.length,
  };
}
