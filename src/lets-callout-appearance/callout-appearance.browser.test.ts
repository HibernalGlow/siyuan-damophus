import { afterEach, describe, expect, it } from "vitest";
import CalloutAppearancePlugin from "./index";
import pluginMetadata from "./plugin";
import {
  CALLOUT_APPEARANCE_CSS,
  CALLOUT_APPEARANCE_STYLE_ID,
  CALLOUT_ENHANCE_STATE_ATTRIBUTE,
  CALLOUT_ENHANCE_STYLE_ID,
  CalloutAppearanceStyles,
  createCalloutAppearanceCss,
  resolveCalloutAppearanceSettings,
} from "./callout-appearance";

const HOST_LIST_STYLE_ID = "siyuan-host-list-styles";
const activeStyles = new Set<CalloutAppearanceStyles>();

function startCalloutAppearance(
  settings: Parameters<CalloutAppearanceStyles["start"]>[0] = {},
): CalloutAppearanceStyles {
  const styles = new CalloutAppearanceStyles(document);
  activeStyles.add(styles);
  styles.start(settings);
  return styles;
}

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
  for (const styles of activeStyles) styles.destroy();
  activeStyles.clear();
  document.body.replaceChildren();
  document.getElementById(CALLOUT_APPEARANCE_STYLE_ID)?.remove();
  document.getElementById(CALLOUT_ENHANCE_STYLE_ID)?.remove();
  document.getElementById(HOST_LIST_STYLE_ID)?.remove();
});

describe("callout appearance", () => {
  it("emits migrated legacy features independently", () => {
    const css = createCalloutAppearanceCss({
      palette: false,
      contentPadding: true,
      removeQuoteShadow: false,
      removeEmbedOutline: true,
      riffMarker: false,
    });
    expect(css).not.toContain('.bq[style*="background1)"]');
    expect(css).toContain(".callout-content { padding-inline-start: 4px; }");
    expect(css).not.toContain("filter: none");
    expect(css).toContain("outline: none !important");
    expect(css).not.toContain("custom-riff-decks");
  });

  it("restores the native left marker for Callouts in flashcard review when enabled", () => {
    document.documentElement.style.setProperty("--b3-protyle-inline-mark-background", "rgb(1, 2, 3)");
    const hostStyle = document.createElement("style");
    hostStyle.textContent = `
      .card__block .protyle-wysiwyg:not([data-doc-type="NodeDocument"]) [data-node-id][custom-riff-decks] {
        box-shadow: none;
      }
    `;
    document.head.append(hostStyle);

    const cardHost = document.createElement("div");
    cardHost.className = "card__block";
    cardHost.innerHTML = `
      <div class="protyle-wysiwyg">
        <div class="callout" data-node-id="flashcard-callout" data-type="NodeCallout" data-subtype="WARNING" custom-riff-decks="deck">
          <div class="callout-info"><span class="callout-title">Warning</span></div>
          <div class="callout-content"><p>Body</p></div>
        </div>
      </div>
    `;
    document.body.append(cardHost);
    const callout = cardHost.querySelector<HTMLElement>(".callout")!;

    const disabledStyles = startCalloutAppearance({ riffMarker: false, flashcardLeftHighlightFix: false });
    expect(getComputedStyle(callout).boxShadow).toBe("none");
    disabledStyles.destroy();

    const enabledStyles = startCalloutAppearance({ flashcardLeftHighlightFix: true });
    expect(getComputedStyle(callout).boxShadow).toContain("inset");
    expect(createCalloutAppearanceCss({ flashcardLeftHighlightFix: true })).toContain(".card__block .protyle-wysiwyg .callout");
    enabledStyles.destroy();
    hostStyle.remove();
    document.documentElement.style.removeProperty("--b3-protyle-inline-mark-background");
  });

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
    startCalloutAppearance();

    const style = getComputedStyle(callout);
    expect(style.paddingTop).toBe("16px");
    expect(style.paddingRight).toBe("16px");
    expect(style.paddingBottom).toBe("10px");
    expect(style.borderRadius).toBe("11px");
    expect(getComputedStyle(callout, "::before").display).toBe("none");
    expect(getComputedStyle(callout.querySelector<HTMLElement>(".callout-icon")!).display)
      .toBe("flex");
  });

  it("keeps the left marker visible in the standard editor", () => {
    document.documentElement.style.setProperty("--b3-protyle-inline-mark-background", "rgb(1, 2, 3)");
    const hostStyle = document.createElement("style");
    hostStyle.textContent = `
      :root body .protyle-wysiwyg .callout[data-type="NodeCallout"] {
        box-shadow: none !important;
      }
    `;
    document.head.append(hostStyle);
    const callout = renderCallout();
    callout.setAttribute("custom-riff-decks", "deck");

    const styles = startCalloutAppearance({ riffMarker: true });
    expect(getComputedStyle(callout).boxShadow).toContain("inset");

    styles.destroy();
    hostStyle.remove();
    document.documentElement.style.removeProperty("--b3-protyle-inline-mark-background");
  });

  it("clamps user adjustments and updates the mounted style", () => {
    expect(resolveCalloutAppearanceSettings({ radius: 99, surfaceOpacity: -4 })).toMatchObject({
      followCalloutTextColor: false,
      radius: 20,
      surfaceOpacity: 0,
      paddingX: 16,
    });
    expect(resolveCalloutAppearanceSettings({ followCalloutTextColor: "true" }))
      .toMatchObject({ followCalloutTextColor: true });

    startCalloutAppearance({ paddingX: 24, titleSize: 18, titleWeight: "600" });
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
    startCalloutAppearance({ paddingX: 28 });

    const outerRect = outer.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const nestedRect = nested.getBoundingClientRect();
    expect(getComputedStyle(nested).boxSizing).toBe("border-box");
    expect(getComputedStyle(nested).maxWidth).toBe("100%");
    expect(nestedRect.right).toBeLessThanOrEqual(contentRect.right + 0.5);
    expect(nestedRect.right).toBeLessThanOrEqual(outerRect.right + 0.5);
  });

  it("optionally lets each nested Callout body inherit its own type color", () => {
    const enhanceStyle = document.createElement("style");
    enhanceStyle.id = CALLOUT_ENHANCE_STYLE_ID;
    enhanceStyle.textContent = `
      :root {
        --b3-callout-important: rgb(118, 86, 214);
        --b3-callout-tip: rgb(22, 138, 69);
        --b3-theme-on-background: rgb(37, 40, 43);
      }
      .callout-info ~ * {
        color: var(--b3-theme-on-background) !important;
      }
    `;
    document.head.append(enhanceStyle);
    const { outer, content, nested } = renderNestedCallout();
    const nestedContent = nested.querySelector<HTMLElement>(":scope > .callout-content")!;
    const styles = startCalloutAppearance();

    expect(getComputedStyle(content).color).not.toBe(getComputedStyle(outer).color);
    expect(getComputedStyle(nestedContent).color).not.toBe(getComputedStyle(nested).color);

    styles.start({ followCalloutTextColor: true });
    expect(getComputedStyle(content).color).toBe(getComputedStyle(outer).color);
    expect(getComputedStyle(nestedContent).color).toBe(getComputedStyle(nested).color);
    expect(getComputedStyle(content).color).not.toBe(getComputedStyle(nestedContent).color);
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
        enhanceStyle.id = CALLOUT_ENHANCE_STYLE_ID;
        enhanceStyle.textContent = '.callout[data-type="NodeCallout"] { display: flex; margin: 0; }';
        document.head.append(enhanceStyle);
      }

      const { action, item, nested } = renderListCallout(insideOuterCallout);
      startCalloutAppearance();

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
    enhanceStyle.id = CALLOUT_ENHANCE_STYLE_ID;
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
    startCalloutAppearance();

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
    expect(CALLOUT_APPEARANCE_CSS).not.toContain(":has(");
  });

  it("tracks Callout Enhance state without relational selectors", async () => {
    const styles = startCalloutAppearance();
    expect(document.documentElement.hasAttribute(CALLOUT_ENHANCE_STATE_ATTRIBUTE)).toBe(false);

    const enhanceStyle = document.createElement("style");
    enhanceStyle.id = CALLOUT_ENHANCE_STYLE_ID;
    document.head.append(enhanceStyle);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(document.documentElement.hasAttribute(CALLOUT_ENHANCE_STATE_ATTRIBUTE)).toBe(true);

    enhanceStyle.remove();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(document.documentElement.hasAttribute(CALLOUT_ENHANCE_STATE_ATTRIBUTE)).toBe(false);

    styles.destroy();
  });

  it("is an independent, disabled-by-default Damophus sub-plugin", () => {
    expect(pluginMetadata).toMatchObject({
      name: "calloutAppearance",
      enabled: false,
      icon: "messageSquareText",
    });
    expect(pluginMetadata.settings).toContainEqual(expect.objectContaining({
      key: "followCalloutTextColor",
      type: "checkbox",
      value: false,
    }));
    expect(pluginMetadata.settings).toContainEqual(expect.objectContaining({
      key: "flashcardLeftHighlightFix",
      type: "checkbox",
      value: false,
    }));

    const plugin = new CalloutAppearancePlugin();
    plugin.onload();
    expect(document.getElementById(CALLOUT_APPEARANCE_STYLE_ID)).not.toBeNull();
    plugin.onunload();
    expect(document.getElementById(CALLOUT_APPEARANCE_STYLE_ID)).toBeNull();
  });
});
