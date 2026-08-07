import { describe, expect, it } from "vitest";
import {
  buildCustomPropertiesCss,
  customPropertyMarkerText,
  customPropertyTargetSelector,
  DEFAULT_CUSTOM_PROPERTIES,
  DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
  LEGACY_DEFAULT_CUSTOM_PROPERTIES,
  parseCustomProperties,
  parseCustomPropertyBlockTypes,
  resolveCustomProperties,
  sanitizeCustomPropertyStyle,
} from "./custom-properties";

describe("custom property display", () => {
  it("uses the question-bank attributes as the default display set", () => {
    const keys = parseCustomProperties(DEFAULT_CUSTOM_PROPERTIES).map(({ key }) => key);

    expect(keys).toEqual(["custom-qb-id", "custom-qb-type"]);
  });

  it("migrates only the untouched legacy default", () => {
    expect(resolveCustomProperties(LEGACY_DEFAULT_CUSTOM_PROPERTIES)).toEqual({
      value: DEFAULT_CUSTOM_PROPERTIES,
      migrated: true,
    });
    expect(resolveCustomProperties("custom-personal|Mine")).toEqual({
      value: "custom-personal|Mine",
      migrated: false,
    });
  });

  it("keeps text blocks enabled while tables remain disabled by default", () => {
    const blockTypes = parseCustomPropertyBlockTypes(DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES);

    expect(blockTypes).toContain("NodeDocument");
    expect(blockTypes).toContain("NodeHeading");
    expect(blockTypes).toContain("NodeParagraph");
    expect(blockTypes).toContain("NodeList");
    expect(blockTypes).not.toContain("NodeTable");
  });

  it("builds selectors for document and block targets without pseudo-elements", () => {
    const selector = customPropertyTargetSelector("NodeDocument\nNodeHeading\nNodeParagraph");

    expect(selector).toContain(".protyle-wysiwyg");
    expect(selector).toContain('[data-node-id][data-type="NodeHeading"]');
    expect(selector).toContain('[data-node-id][data-type="NodeParagraph"]');
    expect(selector).not.toContain("::after");
    expect(selector).not.toContain("NodeTable");
  });

  it("renders the default identity fields on one wrapping line", () => {
    const css = buildCustomPropertiesCss(
      DEFAULT_CUSTOM_PROPERTIES,
      "NodeHeading",
    );

    expect(css).toContain(".damophus-block-attr-marker");
    expect(css).toContain("width: fit-content");
    expect(css).toContain("white-space: normal");
    expect(css).toContain("position: static !important;");
    expect(css).toContain("inset: auto !important;");
    expect(css).toContain("transform: none !important;");
    expect(css).not.toContain("::after");
    expect(css).not.toContain("custom-qb-answer");
  });

  it("lets each property omit its visible label", () => {
    const values: Record<string, string> = {
      "custom-qb-id": "question-1",
      "custom-qb-type": "single",
    };
    const element = { getAttribute: (key: string) => values[key] ?? null } as Element;

    expect(customPropertyMarkerText(
      element,
      parseCustomProperties("custom-qb-id\ncustom-qb-type|type"),
    )).toBe("question-1  \u00b7  type\u00a0single");
  });

  it("accepts scoped visual declarations while rejecting content and remote URLs", () => {
    const style = sanitizeCustomPropertyStyle(`
      color: rgb(1, 2, 3);
      border-radius: 9px;
      content: attr(custom-qb-answer);
      color: attr(custom-qb-answer);
      background: url(https://example.com/pixel.png);
      position: fixed;
    `);

    expect(style).toContain("color: rgb(1, 2, 3);");
    expect(style).toContain("border-radius: 9px;");
    expect(style).not.toContain("content");
    expect(style).not.toContain("attr(");
    expect(style).not.toContain("url(");
    expect(style).not.toContain("position");
  });

  it("ignores invalid and duplicated selector input", () => {
    expect(parseCustomProperties(
      "custom-qb-id|ID\ncustom-qb-id|Duplicate\ncolor:red\ncustom-qb-answer|answer\ncustom-qb-type|type",
    )).toEqual([
      { key: "custom-qb-id", label: "ID" },
      { key: "custom-qb-type", label: "type" },
    ]);
    expect(parseCustomPropertyBlockTypes(
      "NodeHeading\nNodeHeading\nNodeTable] *\nNodeParagraph",
    )).toEqual(["NodeHeading", "NodeParagraph"]);
  });

  it("never generates display CSS for question-bank answers", () => {
    expect(buildCustomPropertiesCss(
      "custom-qb-answer|answer",
      "NodeHeading",
    )).toBe("");
  });
});
