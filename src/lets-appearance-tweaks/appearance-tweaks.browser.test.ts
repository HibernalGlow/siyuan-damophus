import { afterEach, describe, expect, it } from "vitest";
import { APPEARANCE_TWEAKS_STYLE_ID, AppearanceTweaksStyles, createAppearanceTweaksCss } from "./appearance-tweaks";

describe("appearance tweaks", () => {
  afterEach(() => {
    document.getElementById(APPEARANCE_TWEAKS_STYLE_ID)?.remove();
    document.documentElement.removeAttribute("data-frontend");
  });

  it("emits each optional surface independently", () => {
    const css = createAppearanceTweaksCss({ workspace: false, hideDockSplit: true, tags: false, references: true });
    expect(css).not.toContain("barWorkspace");
    expect(css).toContain(".dock__split");
    expect(css).not.toContain('data-type="tag"');
    expect(css).toContain("block-ref");
  });

  it("scopes the separate editor font size to the /mobile Web frontend", () => {
    const css = createAppearanceTweaksCss({
      browserMobileFontSize: true,
      browserMobileEditorFontSize: 21,
    });
    expect(css).toContain('html[data-frontend="browser-mobile"] { --b3-font-size-editor: 21px; }');
    expect(css).not.toContain('html[data-frontend="mobile"]');
    expect(css).not.toContain('html[data-frontend="browser-desktop"]');
  });

  it("keeps the separate editor font size opt-in and clamps its value", () => {
    expect(createAppearanceTweaksCss({ browserMobileEditorFontSize: 21 })).not.toContain("--b3-font-size-editor");
    expect(createAppearanceTweaksCss({ browserMobileFontSize: true, browserMobileEditorFontSize: 100 }))
      .toContain("--b3-font-size-editor: 72px");
  });

  it("updates rendered styles and removes them on destroy", () => {
    document.body.innerHTML = '<div class="dock__split"></div><div class="protyle-wysiwyg"><span data-type="tag">law</span></div>';
    const styles = new AppearanceTweaksStyles(document);
    styles.start();
    const divider = document.querySelector<HTMLElement>(".dock__split")!;
    const tag = document.querySelector<HTMLElement>('[data-type="tag"]')!;
    expect(getComputedStyle(divider).opacity).toBe("0");
    expect(getComputedStyle(tag).borderRadius).toBe("3px");

    styles.start({ hideDockSplit: false, tags: false });
    expect(getComputedStyle(divider).opacity).toBe("1");
    expect(getComputedStyle(tag).borderRadius).toBe("0px");
    styles.destroy();
    expect(document.getElementById(APPEARANCE_TWEAKS_STYLE_ID)).toBeNull();
  });

  it("changes rendered editor text only in the browser-mobile frontend", () => {
    document.documentElement.dataset.frontend = "browser-mobile";
    document.body.innerHTML = '<div class="protyle-wysiwyg" style="font-size:var(--b3-font-size-editor, 16px)">online mobile</div>';
    const styles = new AppearanceTweaksStyles(document);
    styles.start({ browserMobileFontSize: true, browserMobileEditorFontSize: 22 });
    expect(getComputedStyle(document.querySelector<HTMLElement>(".protyle-wysiwyg")!).fontSize).toBe("22px");

    document.documentElement.dataset.frontend = "mobile";
    expect(getComputedStyle(document.querySelector<HTMLElement>(".protyle-wysiwyg")!).fontSize).toBe("16px");
  });
});
