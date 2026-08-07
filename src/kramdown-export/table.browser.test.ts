import { describe, expect, it } from "vitest";
import { convertHtmlTablesToMarkdown } from "./table";

describe("SiYuan table conversion", () => {
  it("converts merged cells to Markdown with IAL placeholders", () => {
    const html = [
      "<table><colgroup><col /><col /><col /></colgroup>",
      "<thead><tr><th colspan=\"2\">{: colspan=\"2\"}合并</th><th>B</th></tr></thead>",
      "<tbody><tr><td rowspan=\"2\">{: rowspan=\"2\"}A</td><td>C</td><td>D</td></tr>",
      "<tr><td>E</td><td>F | G</td></tr></tbody></table>",
    ].join("");
    expect(convertHtmlTablesToMarkdown(html)).toBe([
      "| 合并 {: colspan=\"2\"} | {: class=\"fn__none\"} | B |",
      "| --- | --- | --- |",
      "| A {: rowspan=\"2\"} | C | D |",
      "| {: class=\"fn__none\"} | E | F \\| G |",
      "{: colgroup=\"||\"}",
    ].join("\n"));
  });

  it("leaves non-table content untouched", () => {
    expect(convertHtmlTablesToMarkdown("# Title\n\nText")).toBe("# Title\n\nText");
  });

  it("uses SiYuan's colgroup width when a merged row includes its hidden tail cell", () => {
    const html = [
      "<table><colgroup><col /><col /><col /></colgroup>",
      "<thead><tr><th align=\"center\" colspan=\"2\">{: colspan=\"2\"}合并</th><th>B</th><th></th></tr></thead>",
      "<tbody><tr><td>C</td><td>D</td><td>E</td></tr></tbody></table>",
    ].join("");
    expect(convertHtmlTablesToMarkdown(html)).toBe([
      "| 合并 {: colspan=\"2\" align=\"center\"} | {: class=\"fn__none\"} | B |",
      "| --- | --- | --- |",
      "| C | D | E |",
      "{: colgroup=\"||\"}",
    ].join("\n"));
  });

  it("does not convert a table example inside a fenced code block", () => {
    const source = "```html\n<table><tr><td>A</td></tr></table>\n```";
    expect(convertHtmlTablesToMarkdown(source)).toBe(source);
  });

  it("does not duplicate the table IAL returned by SiYuan", () => {
    const source = [
      "<table><colgroup><col /><col /></colgroup><thead><tr><th>A</th><th>B</th></tr></thead></table>",
      '{: id="table-id" updated="time" colgroup="|"}',
    ].join("\n");
    expect(convertHtmlTablesToMarkdown(source)).toBe([
      "| A | B |",
      "| --- | --- |",
      '{: id="table-id" updated="time" colgroup="|"}',
    ].join("\n"));
  });
});
