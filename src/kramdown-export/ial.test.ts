import { describe, expect, it } from "vitest";
import { containsHtmlTable, filterKramdownIal } from "./ial";

const portable = { mode: "portable" as const, include: [], exclude: [] };

describe("Kramdown export", () => {
  it("removes system and attribute-view metadata by default", () => {
    const markdown = [
      "# Title",
      '{: id="20260807120000-testdoc" updated="20260807120100" custom-qb-id="q-1" custom-sy-av-view="view-1"}',
    ].join("\n");
    expect(filterKramdownIal(markdown, portable)).toBe([
      "# Title",
      '{: custom-qb-id="q-1"}',
    ].join("\n"));
  });

  it("preserves Markdown table and cell IAL", () => {
    const markdown = [
      "| A | B |",
      "| --- | --- |",
      '| merged {: colspan="2" rowspan="1"} | {: class="fn__none"} |',
      '{: id="20260807120000-table" updated="20260807120100" colgroup="||"}',
    ].join("\n");
    const exported = filterKramdownIal(markdown, portable);
    expect(exported).toContain('{: colspan="2" rowspan="1"}');
    expect(exported).toContain('{: class="fn__none"}');
    expect(exported).toContain('{: colgroup="||"}');
    expect(exported).not.toContain("20260807120000-table");
  });

  it("supports explicit include and exclude patterns", () => {
    const markdown = '{: id="block" updated="time" custom-qb-id="q-1" style="color:red"}';
    expect(filterKramdownIal(markdown, {
      mode: "none",
      include: ["custom-qb-*", "id"],
      exclude: ["id"],
    })).toBe('{: custom-qb-id="q-1"}');
    expect(filterKramdownIal("{: #block .notice}", portable)).toBe("{: .notice}");
  });

  it("does not rewrite IAL examples inside code", () => {
    const markdown = [
      "```md",
      '{: id="example" updated="example"}',
      "```",
      'Text {: id="real" style="color:red"}',
    ].join("\n");
    expect(filterKramdownIal(markdown, portable)).toContain('{: id="example" updated="example"}');
    expect(filterKramdownIal(markdown, portable)).toContain('Text {: style="color:red"}');
  });

  it("detects only rendered HTML tables", () => {
    expect(containsHtmlTable("<table><tr><td>A</td></tr></table>")).toBe(true);
    expect(containsHtmlTable("| A | B |\n| --- | --- |")).toBe(false);
    expect(containsHtmlTable("```html\n<table></table>\n```\n`<table>`")).toBe(false);
  });
});
