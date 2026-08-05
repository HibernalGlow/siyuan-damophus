import { describe, expect, it } from "vitest";
import {
  buildCustomPropertiesCss,
  DEFAULT_CUSTOM_PROPERTIES,
  DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
  LEGACY_DEFAULT_CUSTOM_PROPERTIES,
  parseCustomProperties,
  parseCustomPropertyBlockTypes,
  resolveCustomProperties,
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

  it("builds selectors for document and block attributes without the bookmark class", () => {
    const css = buildCustomPropertiesCss(
      "custom-qb-id|ID\ncustom-qb-section|section",
      "NodeDocument\nNodeHeading\nNodeParagraph",
    );

    expect(css).toContain(".protyle-wysiwyg[custom-qb-id]::before");
    expect(css).toContain('[data-node-id][data-type="NodeHeading"][custom-qb-id]::after');
    expect(css).toContain('[data-node-id][data-type="NodeParagraph"][custom-qb-section]::after');
    expect(css).not.toContain("protyle-wysiwyg--attr");
    expect(css).not.toContain("NodeTable");
  });

  it("renders the default identity fields as label and value lines", () => {
    const css = buildCustomPropertiesCss(
      DEFAULT_CUSTOM_PROPERTIES,
      "NodeHeading",
    );

    expect(css).toContain('"qb-id\\A " attr(custom-qb-id) "\\A "');
    expect(css).toContain('"qb-type\\A " attr(custom-qb-type) "\\A "');
    expect(css).toContain("white-space: pre-wrap");
    expect(css).not.toContain("custom-qb-answer");
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
