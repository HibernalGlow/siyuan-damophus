import { afterEach, describe, expect, it } from "vitest";
import {
  BLOCK_ATTRIBUTE_MARKER_CLASS,
  buildCustomPropertiesCss,
  customPropertyTargetSelector,
  DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
  parseCustomProperties,
  syncCustomPropertyMarkers,
} from "./custom-properties";

afterEach(() => {
  document.head.querySelector("#custom-properties-test-style")?.remove();
  document.body.innerHTML = "";
});

describe("custom property markers", () => {
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
    const properties = parseCustomProperties("custom-qb-id|ID");
    const selector = customPropertyTargetSelector(DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES);

    syncCustomPropertyMarkers(document, selector, properties);
    expect(heading.querySelector(`.${BLOCK_ATTRIBUTE_MARKER_CLASS}`)).toBeNull();
    heading.setAttribute("custom-qb-id", "civil-question-1");
    syncCustomPropertyMarkers(document, selector, properties);
    expect(heading.querySelector(`.${BLOCK_ATTRIBUTE_MARKER_CLASS}`)?.textContent).toBe("ID\u00a0civil-question-1");
    expect(table.querySelector(`.${BLOCK_ATTRIBUTE_MARKER_CLASS}`)).toBeNull();

    heading.removeAttribute("custom-qb-id");
    syncCustomPropertyMarkers(document, selector, properties);
    expect(heading.querySelector(`.${BLOCK_ATTRIBUTE_MARKER_CLASS}`)).toBeNull();
  });

  it("uses a real child marker that is independent from the host hover pseudo-element", () => {
    const style = document.createElement("style");
    style.id = "custom-properties-test-style";
    style.textContent = buildCustomPropertiesCss(
      "custom-qb-id|qb-id\ncustom-qb-type|qb-type",
      "NodeHeading",
      "border-radius: 11px; content: attr(custom-qb-answer);",
    );
    style.textContent += `#question:hover::after { content: "host hover"; position: absolute; inset: 0; transform: translateX(100px); }`;
    document.head.appendChild(style);
    document.body.innerHTML = `
      <div class="protyle-wysiwyg">
        <div id="question" data-node-id="20260805000300-question" data-type="NodeHeading"
          custom-qb-id="civil-question-1" custom-qb-type="single"></div>
      </div>
    `;

    const question = document.querySelector<HTMLElement>("#question");
    if (!question) throw new Error("Missing question block");
    syncCustomPropertyMarkers(
      document,
      customPropertyTargetSelector("NodeHeading"),
      parseCustomProperties("custom-qb-id|qb-id\ncustom-qb-type|qb-type"),
    );
    const marker = question.querySelector<HTMLElement>(`.${BLOCK_ATTRIBUTE_MARKER_CLASS}`);
    if (!marker) throw new Error("Missing real marker");
    const markerStyle = getComputedStyle(marker);

    expect(marker.parentElement).toBe(question);
    expect(marker.contentEditable).toBe("false");
    expect(marker.textContent).toBe("qb-id\u00a0civil-question-1  \u00b7  qb-type\u00a0single");
    expect(markerStyle.display).toBe("block");
    expect(markerStyle.position).toBe("static");
    expect(markerStyle.whiteSpace).toBe("normal");
    expect(markerStyle.borderRadius).toBe("11px");
    expect(marker.textContent).not.toContain("custom-qb-answer");
  });
});
