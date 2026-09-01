import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AFWD_PAD_LEFT_VAR,
  AFWD_PAD_RIGHT_VAR,
  FULLWIDTH_CSS,
  FULLWIDTH_STYLE_ID,
  FullwidthSpacingSync,
  FullwidthStyles,
  GLOBAL_SCOPE_CLASS,
  applyGlobalFullwidthScope,
  isThemeNativeAfwd,
} from "./fullwidth-styles";
import { globalExcludedAfwdTypes, parseAfwdAttr, serializeAfwdAttr } from "./fullwidth-attr";
import {
  AFWD_MENU_CLEAR_ID,
  AFWD_MENU_ENTRY_ID,
  afwdMenuItemId,
  buildFullwidthMenuEntry,
} from "./fullwidth-menu-dom";
import pluginMetadata from "./plugin";

afterEach(() => {
  document.body.replaceChildren();
  document.getElementById(FULLWIDTH_STYLE_ID)?.remove();
});

describe("fullwidth styles", () => {
  it("injects the stylesheet once and removes it on destroy", () => {
    const styles = new FullwidthStyles(document);
    styles.start();
    styles.start();
    const mounted = document.querySelectorAll(`#${FULLWIDTH_STYLE_ID}`);
    expect(mounted.length).toBe(1);
    expect(mounted[0].textContent).toBe(FULLWIDTH_CSS);

    styles.destroy();
    expect(document.getElementById(FULLWIDTH_STYLE_ID)).toBeNull();
  });

  it("keeps table breakout selectors for every doc-level scope", () => {
    expect(FULLWIDTH_CSS).toContain('[custom-afwd="all"] > .table:not([custom-afwd="off"])');
    expect(FULLWIDTH_CSS).toContain('[custom-afwd~="t"] > .table:not([custom-afwd="off"])');
    expect(FULLWIDTH_CSS).toContain(" > .table[custom-afwd=\"on\"]");
    expect(FULLWIDTH_CSS).toContain(AFWD_PAD_LEFT_VAR);
    expect(FULLWIDTH_CSS).toContain(AFWD_PAD_RIGHT_VAR);
  });

  it("overrides inline image wrapper widths with important declarations", () => {
    expect(FULLWIDTH_CSS).toContain(".img > span:nth-child(2) {\n  width: 100% !important;");
  });

  it("attaches descendant selectors to every scope segment, not only the last", () => {
    // Regression: a suffix appended to a comma-joined scope list used to
    // reach only the final segment, so the image container rules never
    // matched while the paragraph itself got the breakout margins.
    expect(FULLWIDTH_CSS).toContain(
      '.layout__center .protyle-wysiwyg[custom-afwd="all"] > .p:not([custom-afwd="off"]) .img',
    );
    expect(FULLWIDTH_CSS).toContain(
      'body.damophus-mobile .protyle-wysiwyg[custom-afwd~="p"] > .p:not([custom-afwd="off"]) .img',
    );
    expect(FULLWIDTH_CSS).toContain(
      '.layout__center .protyle-wysiwyg > .p[custom-afwd="on"] .img > span:nth-child(2)',
    );
  });

  it("adds a deep breakout rule driven by the native editor width variable", () => {
    expect(FULLWIDTH_CSS).toContain('.p[custom-afwd="deep"] .img');
    expect(FULLWIDTH_CSS).toContain("calc(100% + var(--damo-afwd-pad-right, 16px) - var(--b3-width-protyle, 100%))");
  });

  it("forces the table wrapper to span the full editor width", () => {
    // Shrink-to-fit wrappers would otherwise leave the table stuck to the
    // left edge with the right side falling short.
    expect(FULLWIDTH_CSS).toContain(
      "width: calc(100% + var(--damo-afwd-pad-left, 24px) + var(--damo-afwd-pad-right, 16px));",
    );
    expect(FULLWIDTH_CSS).toContain("max-width: none;");
  });

  it("scopes a global default rule that keeps per-block opt-outs", () => {
    expect(FULLWIDTH_CSS).toContain(
      `html.${GLOBAL_SCOPE_CLASS}:not(.damophus-afwd-global-off-p) .layout__center .protyle-wysiwyg > .p:not([custom-afwd="off"]) .img`,
    );
    expect(FULLWIDTH_CSS).toContain(
      `html.${GLOBAL_SCOPE_CLASS}:not(.damophus-afwd-global-off-t) .layout__center .protyle-wysiwyg > .table:not([custom-afwd="off"]) > div:first-child`,
    );
    expect(FULLWIDTH_CSS).toContain(
      `html.${GLOBAL_SCOPE_CLASS}:not(.damophus-afwd-global-off-db) body.damophus-mobile .protyle-wysiwyg > .av:not([custom-afwd="off"]) .av__container`,
    );
  });

  it("lets the global default exclude single block types", () => {
    expect(FULLWIDTH_CSS).toContain(
      `html.${GLOBAL_SCOPE_CLASS}:not(.damophus-afwd-global-off-t) .layout__center .protyle-wysiwyg > .table:not([custom-afwd="off"])`,
    );
    expect(FULLWIDTH_CSS).toContain(
      `html.${GLOBAL_SCOPE_CLASS}:not(.damophus-afwd-global-off-p) .layout__center .protyle-wysiwyg > .p:not([custom-afwd="off"]) .img`,
    );
    expect(FULLWIDTH_CSS).toContain(
      `html.${GLOBAL_SCOPE_CLASS}:not(.damophus-afwd-global-off-db) body.damophus-mobile .protyle-wysiwyg > .av:not([custom-afwd="off"]) .av__container`,
    );
  });
});

describe("theme native full-width detection", () => {
  it("yields when the active theme defines --protyle-spacing on the editor", () => {
    const editor = document.createElement("div");
    editor.className = "protyle-wysiwyg";
    editor.style.setProperty("--protyle-spacing", "24px");
    document.body.append(editor);
    expect(isThemeNativeAfwd(document)).toBe(true);
  });

  it("activates on themes without their own full-width support", () => {
    const editor = document.createElement("div");
    editor.className = "protyle-wysiwyg";
    document.body.append(editor);
    expect(isThemeNativeAfwd(document)).toBe(false);
  });
});

describe("global default full-width toggle", () => {
  afterEach(() => {
    document.documentElement.classList.remove(GLOBAL_SCOPE_CLASS);
    for (const docType of ["p", "t", "db", "iframe", "sb"]) {
      document.documentElement.classList.remove(`damophus-afwd-global-off-${docType}`);
    }
  });

  it("toggles the marker class on the document element", () => {
    applyGlobalFullwidthScope(document, true);
    expect(document.documentElement.classList.contains(GLOBAL_SCOPE_CLASS)).toBe(true);

    applyGlobalFullwidthScope(document, false);
    expect(document.documentElement.classList.contains(GLOBAL_SCOPE_CLASS)).toBe(false);
  });

  it("marks excluded block types only while the global toggle is on", () => {
    applyGlobalFullwidthScope(document, true, ["t", "db"]);
    expect(document.documentElement.classList.contains("damophus-afwd-global-off-t")).toBe(true);
    expect(document.documentElement.classList.contains("damophus-afwd-global-off-db")).toBe(true);
    expect(document.documentElement.classList.contains("damophus-afwd-global-off-p")).toBe(false);

    applyGlobalFullwidthScope(document, false, ["t", "db"]);
    expect(document.documentElement.classList.contains("damophus-afwd-global-off-t")).toBe(false);
    expect(document.documentElement.classList.contains("damophus-afwd-global-off-db")).toBe(false);
  });

  it("declares the global toggle through a declaration like the other modules", () => {
    const declaration = pluginMetadata.declarations?.find((item) => item.id === "globalDefault");
    expect(declaration?.title).toBe("lets-block-fullwidth.globalTitle");
    expect(declaration?.settings).toContainEqual(expect.objectContaining({
      key: "globalEnabled",
      type: "checkbox",
      value: false,
      menu: true,
    }));
  });

  it("offers a block type exclusion setting", () => {
    expect(pluginMetadata.settings).toContainEqual(expect.objectContaining({
      key: "globalExcludedTypes",
      type: "blockTypes",
      value: [],
    }));
  });
});

describe("global exclusion type mapping", () => {
  it("maps SiYuan block types to full-width type keys", () => {
    expect(globalExcludedAfwdTypes(["NodeTable", "NodeAttributeView", "NodeVideo", "NodeIFrame", "NodeWidget"]))
      .toEqual(["t", "db", "iframe"]);
    expect(globalExcludedAfwdTypes(["NodeParagraph", "NodeSuperBlock"])).toEqual(["p", "sb"]);
  });

  it("ignores unknown values and non-array input", () => {
    expect(globalExcludedAfwdTypes(["NodeCodeBlock", "whatever"])).toEqual([]);
    expect(globalExcludedAfwdTypes(undefined)).toEqual([]);
    expect(globalExcludedAfwdTypes("NodeTable")).toEqual([]);
  });
});

describe("fullwidth spacing sync", () => {
  it("stores measured per-side editor padding as custom properties", async () => {
    const editor = document.createElement("div");
    editor.className = "protyle-wysiwyg";
    editor.style.paddingLeft = "24px";
    editor.style.paddingRight = "16px";
    document.body.append(editor);

    const sync = new FullwidthSpacingSync(document);
    sync.start();

    await vi.waitFor(() => {
      expect(editor.style.getPropertyValue(AFWD_PAD_LEFT_VAR)).toBe("24px");
      expect(editor.style.getPropertyValue(AFWD_PAD_RIGHT_VAR)).toBe("16px");
    });

    sync.stop();
    expect(editor.style.getPropertyValue(AFWD_PAD_LEFT_VAR)).toBe("");
    expect(editor.style.getPropertyValue(AFWD_PAD_RIGHT_VAR)).toBe("");
  });

  it("updates the padding variables when the editor padding changes", async () => {
    const editor = document.createElement("div");
    editor.className = "protyle-wysiwyg";
    editor.style.padding = "24px 16px";
    document.body.append(editor);

    const sync = new FullwidthSpacingSync(document);
    sync.start();
    await vi.waitFor(() => {
      expect(editor.style.getPropertyValue(AFWD_PAD_RIGHT_VAR)).toBe("16px");
    });

    editor.style.padding = "96px 96px";
    await vi.waitFor(() => {
      expect(editor.style.getPropertyValue(AFWD_PAD_LEFT_VAR)).toBe("96px");
      expect(editor.style.getPropertyValue(AFWD_PAD_RIGHT_VAR)).toBe("96px");
    });

    sync.stop();
  });

  it("drops variables for editors removed from the document", async () => {
    const editor = document.createElement("div");
    editor.className = "protyle-wysiwyg";
    editor.style.paddingLeft = "24px";
    editor.style.paddingRight = "16px";
    document.body.append(editor);

    const sync = new FullwidthSpacingSync(document);
    sync.start();
    await vi.waitFor(() => {
      expect(editor.style.getPropertyValue(AFWD_PAD_LEFT_VAR)).toBe("24px");
    });

    editor.remove();
    await vi.waitFor(() => {
      expect(editor.style.getPropertyValue(AFWD_PAD_LEFT_VAR)).toBe("");
    });

    sync.stop();
  });
});

describe("fullwidth attribute helpers", () => {
  it("parses whitespace separated attribute values", () => {
    expect(parseAfwdAttr(undefined)).toEqual([]);
    expect(parseAfwdAttr("")).toEqual([]);
    expect(parseAfwdAttr("  ")).toEqual([]);
    expect(parseAfwdAttr("p t")).toEqual(["p", "t"]);
    expect(parseAfwdAttr("  all ")).toEqual(["all"]);
  });

  it("serializes values without duplicates and preserves order", () => {
    expect(serializeAfwdAttr([])).toBe("");
    expect(serializeAfwdAttr(["p", "t"])).toBe("p t");
    expect(serializeAfwdAttr(["p", "t", "p"])).toBe("p t");
    expect(serializeAfwdAttr(["", "t", " "])).toBe("t");
  });
});

describe("fullwidth menu entry", () => {
  it("builds doc-level switches with an exclusive all option", () => {
    const entry = buildFullwidthMenuEntry(true, {
      entry: "Full width display",
      all: "All blocks",
      db: "Databases",
      t: "Tables",
      p: "Images",
      iframe: "iframe / video / widget",
      sb: "Horizontal super blocks",
      on: "",
      deep: "",
      off: "",
      clear: "Clear attribute",
    });

    expect(entry.id).toBe(AFWD_MENU_ENTRY_ID);
    for (const key of ["all", "db", "t", "p", "iframe", "sb"]) {
      const item = entry.querySelector(`#${afwdMenuItemId(key)}`);
      expect(item).not.toBeNull();
      expect(item?.querySelector("input[type=checkbox]")).not.toBeNull();
    }
    expect(entry.querySelector(`#${afwdMenuItemId("on")}`)).toBeNull();
    expect(entry.querySelector(`#${AFWD_MENU_CLEAR_ID}`)).not.toBeNull();
    expect(entry.getAttribute("data-plugin-id")).toBe("siyuan-damophus");
    expect(entry.getAttribute("data-damophus-module")).toBe("blockFullwidth");
  });

  it("builds block-level on/off options", () => {
    const entry = buildFullwidthMenuEntry(false, {
      entry: "Full width display",
      all: "",
      db: "",
      t: "",
      p: "",
      iframe: "",
      sb: "",
      on: "Enable full width",
      deep: "",
      off: "Disable full width",
      clear: "Clear attribute",
    });

    expect(entry.querySelector(`#${afwdMenuItemId("on")}`)?.querySelector("input")).toBeNull();
    expect(entry.querySelector(`#${afwdMenuItemId("off")}`)).not.toBeNull();
    expect(entry.querySelector(`#${afwdMenuItemId("all")}`)).toBeNull();
    expect(entry.querySelector(`#${AFWD_MENU_CLEAR_ID}`)).not.toBeNull();
  });

  it("offers the deep container breakout on image paragraphs", () => {
    const entry = buildFullwidthMenuEntry(false, {
      entry: "Full width display",
      all: "",
      db: "",
      t: "",
      p: "",
      iframe: "",
      sb: "",
      on: "Enable full width",
      deep: "Full width across containers",
      off: "Disable full width",
      clear: "Clear attribute",
    }, ["on", "deep", "off"]);

    expect(entry.querySelector(`#${afwdMenuItemId("deep")}`)).not.toBeNull();
    expect(entry.querySelector(`#${afwdMenuItemId("on")}`)).not.toBeNull();
    expect(entry.querySelector(`#${afwdMenuItemId("off")}`)).not.toBeNull();
    expect(entry.querySelector(`#${afwdMenuItemId("all")}`)).toBeNull();
  });
});
