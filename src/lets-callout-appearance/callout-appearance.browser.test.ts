import { afterEach, describe, expect, it } from "vitest";
import CalloutAppearancePlugin from "./index";
import pluginMetadata from "./plugin";
import {
  CALLOUT_APPEARANCE_CSS,
  CALLOUT_APPEARANCE_STYLE_ID,
  CalloutAppearanceStyles,
  createCalloutAppearanceCss,
  resolveCalloutAppearanceSettings,
} from "./callout-appearance";

const ENHANCE_STYLE_ID = "callout-enhance-dynamic-styles";
const HOST_LIST_STYLE_ID = "siyuan-host-list-styles";

function renderCallout(): HTMLElement {
  const editor = document.createElement("div");
  editor.className = "protyle-wysiwyg";
  editor.innerHTML = `
    <div class="callout" data-type="NodeCallout" data-subtype="NOTE">
      <div class="callout-info">
        <span class="callout-icon">N</span>
        <span class="callout-title" contenteditable="true">Note</span>
      </div>
      <div class="callout-content"><p>Body</p></div>
    </div>
  `;
  document.body.append(editor);
  return editor.querySelector<HTMLElement>(".callout")!;
}

function renderNestedCallout(): { outer: HTMLElement; content: HTMLElement; nested: HTMLElement } {
  const editor = document.createElement("div");
  editor.className = "protyle-wysiwyg";
  editor.style.width = "320px";
  editor.innerHTML = `
    <div class="callout" data-type="NodeCallout" data-subtype="IMPORTANT">
      <div class="callout-info">
        <span class="callout-icon">I</span>
        <span class="callout-title">Important</span>
      </div>
      <div class="callout-content">
        <p>Outer body</p>
        <div class="callout" data-type="NodeCallout" data-subtype="TIP">
          <div class="callout-info">
            <span class="callout-icon">T</span>
            <span class="callout-title">Tip</span>
          </div>
          <div class="callout-content"><p>Nested body</p></div>
        </div>
      </div>
    </div>
  `;
  document.body.append(editor);
  const callouts = editor.querySelectorAll<HTMLElement>(".callout");
  return {
    outer: callouts[0],
    content: callouts[0].querySelector<HTMLElement>(":scope > .callout-content")!,
    nested: callouts[1],
  };
}

function renderListCallout(insideOuterCallout: boolean): {
  action: HTMLElement;
  item: HTMLElement;
  nested: HTMLElement;
} {
  const hostStyle = document.createElement("style");
  hostStyle.id = HOST_LIST_STYLE_ID;
  hostStyle.textContent = `
    .protyle-wysiwyg [data-node-id].list {
      display: flex;
      flex-direction: column;
    }
    .protyle-wysiwyg [data-node-id].li {
      position: relative;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .protyle-wysiwyg [data-node-id].li > [data-node-id] {
      margin-left: 34px;
    }
    .protyle-wysiwyg [data-node-id].li > .protyle-action {
      position: absolute;
      left: 0;
      width: 34px;
    }
  `;
  document.head.append(hostStyle);

  const editor = document.createElement("div");
  editor.className = "protyle-wysiwyg";
  editor.style.width = "360px";
  const list = `
    <div class="list" data-node-id="list" data-type="NodeList">
      <div class="li" data-node-id="item" data-type="NodeListItem">
        <div class="protyle-action">1.</div>
        <div class="p" data-node-id="paragraph" data-type="NodeParagraph">List item</div>
        <div class="callout" data-node-id="nested" data-type="NodeCallout" data-subtype="NOTE">
          <div class="callout-info"><span class="callout-title">Note</span></div>
          <div class="callout-content"><p>Nested body</p></div>
        </div>
      </div>
    </div>
  `;
  editor.innerHTML = insideOuterCallout
    ? `<div class="callout" data-node-id="outer" data-type="NodeCallout" data-subtype="IMPORTANT">
        <div class="callout-info"><span class="callout-title">Important</span></div>
        <div class="callout-content">${list}</div>
      </div>`
    : list;
  document.body.append(editor);
  return {
    action: editor.querySelector<HTMLElement>(".protyle-action")!,
    item: editor.querySelector<HTMLElement>('[data-node-id="item"]')!,
    nested: editor.querySelector<HTMLElement>('[data-node-id="nested"]')!,
  };
}

afterEach(() => {
  document.body.replaceChildren();
  document.getElementById(CALLOUT_APPEARANCE_STYLE_ID)?.remove();
  document.getElementById(ENHANCE_STYLE_ID)?.remove();
  document.getElementById(HOST_LIST_STYLE_ID)?.remove();
});

describe("callout appearance", () => {
  it("mounts once and removes only its own style node", () => {
    const unrelated = document.createElement("style");
    unrelated.id = "unrelated-style";
    document.head.append(unrelated);
    const styles = new CalloutAppearanceStyles(document);

    styles.start();
    styles.start();
    expect(document.querySelectorAll(`#${CALLOUT_APPEARANCE_STYLE_ID}`)).toHaveLength(1);
    expect(document.getElementById(CALLOUT_APPEARANCE_STYLE_ID)?.textContent)
      .toBe(CALLOUT_APPEARANCE_CSS);

    styles.destroy();
    expect(document.getElementById(CALLOUT_APPEARANCE_STYLE_ID)).toBeNull();
    expect(document.getElementById("unrelated-style")).toBe(unrelated);
    unrelated.remove();
  });

  it("keeps the Neo-like card when Callout Enhance is absent", () => {
    const callout = renderCallout();
    new CalloutAppearanceStyles(document).start();

    const style = getComputedStyle(callout);
    expect(style.paddingTop).toBe("16px");
    expect(style.paddingRight).toBe("16px");
    expect(style.paddingBottom).toBe("10px");
    expect(style.borderRadius).toBe("11px");
    expect(getComputedStyle(callout, "::before").display).toBe("none");
    expect(getComputedStyle(callout.querySelector<HTMLElement>(".callout-icon")!).display)
      .toBe("flex");
  });

  it("clamps user adjustments and updates the mounted style", () => {
    expect(resolveCalloutAppearanceSettings({ radius: 99, surfaceOpacity: -4 })).toMatchObject({
      radius: 20,
      surfaceOpacity: 0,
      paddingX: 16,
    });

    const styles = new CalloutAppearanceStyles(document);
    styles.start({ paddingX: 24, titleSize: 18, titleWeight: "600" });
    expect(document.getElementById(CALLOUT_APPEARANCE_STYLE_ID)?.textContent).toBe(
      createCalloutAppearanceCss({ paddingX: 24, titleSize: 18, titleWeight: "600" }),
    );

    const callout = renderCallout();
    expect(getComputedStyle(callout).paddingLeft).toBe("24px");
    expect(getComputedStyle(callout.querySelector<HTMLElement>(".callout-title")!).fontSize)
      .toBe("18px");
  });

  it("contains a nested Callout inside the parent content box", () => {
    const { outer, content, nested } = renderNestedCallout();
    new CalloutAppearanceStyles(document).start({ paddingX: 28 });

    const outerRect = outer.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const nestedRect = nested.getBoundingClientRect();
    expect(getComputedStyle(nested).boxSizing).toBe("border-box");
    expect(getComputedStyle(nested).maxWidth).toBe("100%");
    expect(nestedRect.right).toBeLessThanOrEqual(contentRect.right + 0.5);
    expect(nestedRect.right).toBeLessThanOrEqual(outerRect.right + 0.5);
  });

  it.each([
    ["a top-level list", false, false],
    ["a top-level list", false, true],
    ["a Callout-nested list", true, false],
    ["a Callout-nested list", true, true],
  ])(
    "preserves the SiYuan list gutter in %s with Callout Enhance active: %s",
    (_scenario, insideOuterCallout, enhanceActive) => {
      if (enhanceActive) {
        const enhanceStyle = document.createElement("style");
        enhanceStyle.id = ENHANCE_STYLE_ID;
        enhanceStyle.textContent = '.callout[data-type="NodeCallout"] { display: flex; margin: 0; }';
        document.head.append(enhanceStyle);
      }

      const { action, item, nested } = renderListCallout(insideOuterCallout);
      new CalloutAppearanceStyles(document).start();

      const actionRect = action.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      const nestedRect = nested.getBoundingClientRect();
      expect(getComputedStyle(nested).marginLeft).toBe("34px");
      expect(nestedRect.left).toBeGreaterThanOrEqual(actionRect.right - 0.5);
      expect(nestedRect.right).toBeLessThanOrEqual(itemRect.right + 0.5);
    },
  );

  it("overrides only the visual layer when Callout Enhance is active", () => {
    const enhanceStyle = document.createElement("style");
    enhanceStyle.id = ENHANCE_STYLE_ID;
    enhanceStyle.textContent = `
      .callout[data-type="NodeCallout"] {
        --callout-icon-before-display: block;
        padding: 1px !important;
        border-radius: 2px !important;
        outline: none !important;
        background: rgb(255, 0, 0) !important;
      }
      .callout[data-type="NodeCallout"]::before { content: ""; display: block; }
      .callout[data-type="NodeCallout"] .callout-icon { display: none; }
      .callout[data-type="NodeCallout"] > .callout-info::after {
        content: "";
        display: block;
        width: 20px;
        pointer-events: auto;
      }
    `;
    document.head.append(enhanceStyle);
    const callout = renderCallout();
    new CalloutAppearanceStyles(document).start();

    const style = getComputedStyle(callout);
    expect(style.paddingTop).toBe("16px");
    expect(style.borderRadius).toBe("11px");
    expect(style.outlineStyle).toBe("solid");
    expect(getComputedStyle(callout, "::before").display).toBe("block");
    expect(getComputedStyle(callout.querySelector<HTMLElement>(".callout-icon")!).display)
      .toBe("none");

    const foldButton = getComputedStyle(callout.querySelector<HTMLElement>(".callout-info")!, "::after");
    expect(foldButton.display).toBe("block");
    expect(foldButton.width).toBe("20px");
    expect(foldButton.pointerEvents).toBe("auto");
    expect(CALLOUT_APPEARANCE_CSS).not.toContain("pointer-events:");
    expect(CALLOUT_APPEARANCE_CSS).not.toContain("[fold=");
  });

  it("is an independent, enabled-by-default Damophus sub-plugin", () => {
    expect(pluginMetadata).toMatchObject({
      name: "calloutAppearance",
      enabled: true,
      icon: "messageSquareText",
    });

    const plugin = new CalloutAppearancePlugin();
    plugin.onload();
    expect(document.getElementById(CALLOUT_APPEARANCE_STYLE_ID)).not.toBeNull();
    plugin.onunload();
    expect(document.getElementById(CALLOUT_APPEARANCE_STYLE_ID)).toBeNull();
  });
});
