import { afterEach, describe, expect, it } from "vitest";
import AttributeMarkerDisplay, { ATTRIBUTE_MARKER_STYLE_ID } from "./attribute-marker-display";
import {
  DEFAULT_CUSTOM_PROPERTIES,
  DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
  DEFAULT_CUSTOM_PROPERTY_STYLE,
} from "./custom-properties";

afterEach(() => {
  document.head.querySelectorAll("style[data-test-style]").forEach((element) => element.remove());
  document.getElementById(ATTRIBUTE_MARKER_STYLE_ID)?.remove();
  document.body.replaceChildren();
});

describe("attribute marker display ownership", () => {
  it("removes only its own style element", () => {
    const foreignStyle = document.createElement("style");
    foreignStyle.dataset.testStyle = "foreign";
    foreignStyle.id = "foreign-plugin-style";
    document.head.appendChild(foreignStyle);

    const display = new AttributeMarkerDisplay();
    display.onload(
      DEFAULT_CUSTOM_PROPERTIES,
      DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
      DEFAULT_CUSTOM_PROPERTY_STYLE,
    );

    expect(document.getElementById(ATTRIBUTE_MARKER_STYLE_ID)).not.toBeNull();
    display.onunload();
    expect(document.getElementById(ATTRIBUTE_MARKER_STYLE_ID)).toBeNull();
    expect(document.getElementById("foreign-plugin-style")).toBe(foreignStyle);
  });
});
