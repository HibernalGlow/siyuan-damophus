import { describe, expect, it } from "vitest";
import { renderSolutionHtml } from "./renderer";

describe("solution renderer", () => {
  it("renders GFM while removing unsafe HTML and URLs", () => {
    const html = renderSolutionHtml(
      "| A | B |\n| - | - |\n| 1 | 2 |\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))",
    );

    expect(html).toContain("<table>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
  });
});
