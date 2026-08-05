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
});
