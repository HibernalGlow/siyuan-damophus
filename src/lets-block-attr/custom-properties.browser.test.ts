import { afterEach, describe, expect, it } from "vitest";
import {
  buildCustomPropertiesCss,
  DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
} from "./custom-properties";

afterEach(() => {
  document.head.querySelector("#custom-properties-test-style")?.remove();
  document.body.innerHTML = "";
});

describe("custom property display CSS", () => {
  it("reacts to configured attributes only on enabled block types", () => {
    const style = document.createElement("style");
    style.id = "custom-properties-test-style";
    style.textContent = buildCustomPropertiesCss(
      "custom-qb-id|ID",
      DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
    );
    document.head.appendChild(style);
    document.body.innerHTML = `
      <div class="protyle-wysiwyg">
        <div id="heading" data-node-id="20260805000100-heading" data-type="NodeHeading"></div>
        <div id="table" data-node-id="20260805000200-table01" data-type="NodeTable" custom-qb-id="table-question"></div>
      </div>
    `;

    const heading = document.querySelector<HTMLElement>("#heading");
    const table = document.querySelector<HTMLElement>("#table");
    if (!heading || !table) throw new Error("Missing test blocks");

    expect(getComputedStyle(heading, "::after").content).toBe("none");
    heading.setAttribute("custom-qb-id", "civil-question-1");
    expect(getComputedStyle(heading, "::after").display).toBe("block");
    expect(getComputedStyle(heading, "::after").content).not.toBe("none");
    expect(getComputedStyle(table, "::after").content).toBe("none");

    heading.removeAttribute("custom-qb-id");
    expect(getComputedStyle(heading, "::after").content).toBe("none");
  });

  it("keeps identity values horizontal and applies safe custom styling", () => {
    const style = document.createElement("style");
    style.id = "custom-properties-test-style";
    style.textContent = buildCustomPropertiesCss(
      "custom-qb-id|qb-id\ncustom-qb-type|qb-type",
      "NodeHeading",
      "border-radius: 11px; content: attr(custom-qb-answer);",
    );
    document.head.appendChild(style);
    document.body.innerHTML = `
      <div class="protyle-wysiwyg">
        <div id="question" data-node-id="20260805000300-question" data-type="NodeHeading"
          custom-qb-id="civil-question-1" custom-qb-type="single"></div>
      </div>
    `;

    const question = document.querySelector<HTMLElement>("#question");
    if (!question) throw new Error("Missing question block");
    const marker = getComputedStyle(question, "::after");

    expect(marker.display).toBe("block");
    expect(marker.whiteSpace).toBe("normal");
    expect(marker.borderRadius).toBe("11px");
    expect(marker.content).toContain("civil-question-1");
    expect(marker.content).toContain("single");
    expect(marker.content).not.toContain("custom-qb-answer");
  });
});
