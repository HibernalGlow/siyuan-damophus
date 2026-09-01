export const FULLWIDTH_STYLE_ID = "damophus-block-fullwidth-style";

import { AFWD_DOC_KEYS } from "./fullwidth-attr";

export const AFWD_PAD_LEFT_VAR = "--damo-afwd-pad-left";
export const AFWD_PAD_RIGHT_VAR = "--damo-afwd-pad-right";

export const MOBILE_SCOPE_CLASS = "damophus-mobile";

// Marker for the "full width in all documents" toggle: every editor behaves
// as if the document-level all attribute were set. Single blocks can still
// opt out with the off attribute.
export const GLOBAL_SCOPE_CLASS = "damophus-afwd-global";

// Per-type opt-outs of the global default (see globalExcludedTypes): the
// suffix is one of the doc-level type keys (p / t / db / iframe / sb).
export const GLOBAL_EXCLUDE_CLASS_PREFIX = "damophus-afwd-global-off-";

const AFWD_ATTR = "custom-afwd";

// SiYuan natively exposes --b3-width-protyle-* since 3.3.6, but those values
// cannot express the (asymmetric) left/right editor padding per side. The
// module therefore injects measured per-side values as inline custom
// properties; the fallbacks below match the SiYuan stock padding.
const padLeft = `var(${AFWD_PAD_LEFT_VAR}, 24px)`;
const padRight = `var(${AFWD_PAD_RIGHT_VAR}, 16px)`;

const editorScopes = (tail: string): string[] => [
  `.layout__center .protyle-wysiwyg${tail}`,
  `body.${MOBILE_SCOPE_CLASS} .protyle-wysiwyg${tail}`,
];

const globalScopes = (block: string, docType: string): string[] => [
  `html.${GLOBAL_SCOPE_CLASS}:not(.${GLOBAL_EXCLUDE_CLASS_PREFIX}${docType}) .layout__center .protyle-wysiwyg > ${block}:not([${AFWD_ATTR}="off"])`,
  `html.${GLOBAL_SCOPE_CLASS}:not(.${GLOBAL_EXCLUDE_CLASS_PREFIX}${docType}) body.${MOBILE_SCOPE_CLASS} .protyle-wysiwyg > ${block}:not([${AFWD_ATTR}="off"])`,
];

// Every activation form of one block type: doc-level "all", doc-level
// per-type, the global default toggle, and the block-level "on" attribute.
const blockScopes = (block: string, docType: string): string[] => [
  ...editorScopes(`[${AFWD_ATTR}="all"] > ${block}:not([${AFWD_ATTR}="off"])`),
  ...editorScopes(`[${AFWD_ATTR}~="${docType}"] > ${block}:not([${AFWD_ATTR}="off"])`),
  ...globalScopes(block, docType),
  ...editorScopes(` > ${block}[${AFWD_ATTR}="on"]`),
];

// A suffix (descendant/child combinator) must be attached to EVERY comma
// segment; appending it to a joined list would only reach the last segment
// and leave the remaining segments selecting the block element itself.
const scoped = (scopes: string[], suffix: string): string =>
  scopes.map((scope) => scope + suffix).join(",\n");

const image = blockScopes(".p", "p");
// "deep" opts a single image paragraph into breaking out of any container
// block (lists, quotes, super blocks). The margin formula uses the native
// editor-width variable: right side keeps the editor padding, left side
// consumes whatever indentation the containers add. At the first level the
// formula degenerates to exactly the standard breakout margins.
const deepImage = editorScopes(` .p[${AFWD_ATTR}="deep"]`);
const iframe = blockScopes(".iframe", "iframe");
const av = blockScopes(".av", "db");
const avGallery = blockScopes(".av[data-av-type=\"gallery\"]", "db");
const avKanban = blockScopes(".av[data-av-type=\"kanban\"]", "db");
const sb = blockScopes(".sb[data-sb-layout=\"col\"]", "sb");
const table = blockScopes(".table", "t");

// Kept flat on purpose: the stylesheet is injected as a raw string and must
// not rely on native CSS nesting support (mobile webviews).
export const FULLWIDTH_CSS = `
/* Ported from the Asri theme full-width display feature (custom-afwd). */
${scoped(image, " .img")} {
  display: block !important;
  margin: 0 calc(${padRight} * -1) 0 calc(${padLeft} * -1);
  max-width: unset !important;
  transition: margin 0.2s;
}
${scoped(image, " .img > span:nth-child(2)")} {
  width: 100% !important;
  max-width: unset !important;
}
${scoped(image, " .img > span:nth-child(2) img")} {
  width: 100% !important;
  height: 100% !important;
  max-width: unset;
  border-radius: 0;
}
${scoped(image, " .img > span:nth-child(2) .protyle-action__drag")} {
  display: none;
}
${scoped(image, " .img__net")} {
  border-radius: 0;
}
${scoped(image, " .img .protyle-action__title")} {
  width: auto;
  padding: 0.5em ${padRight} 0 ${padLeft};
}

${scoped(deepImage, " .img")} {
  display: block;
  margin-right: calc(${padRight} * -1);
  margin-left: calc(100% + ${padRight} - var(--b3-width-protyle, 100%));
  max-width: unset;
  transition: margin 0.2s;
}
${scoped(deepImage, " .img > span:nth-child(2)")} {
  width: 100% !important;
  max-width: unset !important;
}
${scoped(deepImage, " .img > span:nth-child(2) img")} {
  width: 100% !important;
  height: auto !important;
  max-width: unset;
  border-radius: 0;
}
${scoped(deepImage, " .img > span:nth-child(2) .protyle-action__drag")} {
  display: none;
}
${scoped(deepImage, " .img__net")} {
  border-radius: 0;
}

${scoped(iframe, " .iframe-content")} {
  display: block;
  width: auto;
  margin: 0 calc(${padRight} * -1) 0 calc(${padLeft} * -1);
  transition: margin 0.2s;
}
${scoped(iframe, " .iframe-content video")},
${scoped(iframe, " .iframe-content iframe")} {
  max-height: unset;
  width: 100% !important;
  border-radius: 0;
}

${scoped(av, " .av__container")} {
  margin: 0 calc(${padRight} * -1) 0 calc(${padLeft} * -1);
  transition: margin 0.2s;
}
${scoped(av, " .av__container .av__header .av__counter")} {
  width: calc(100% - ${padLeft} - ${padRight} - 6px);
}
${scoped(av, " .av__container .av__header")},
${scoped(av, " .av__container .av__scroll")} {
  padding: 0 calc(${padRight} + 3px) 0 calc(${padLeft} + 3px);
  transition: padding 0.2s;
}
${scoped(av, " .av__container .av__scroll")} {
  scrollbar-width: none;
}
${scoped(av, " .av__container .av__scroll::-webkit-scrollbar")} {
  display: none;
}
${scoped(av, " .av__container .av__colsticky")} {
  left: calc(${padLeft} * -1 - 3px);
}
${scoped(av, " .av__container .av__row--util .av__colsticky")} {
  opacity: unset;
}
${scoped(av, " .av__container .av__gallery")},
${scoped(av, " .av__container .av__kanban")} {
  padding: 4px 24px;
  width: calc(100% - 48px);
}
${scoped(av, " .av__container .av__kanban-group > .av__body > .av__gallery")} {
  padding: unset;
  width: 100%;
}

${scoped(avGallery, " .av__group-title")} {
  padding-left: 24px;
  padding-right: 24px;
}
${scoped(avGallery, " .av__container")} {
  overflow: hidden;
  width: -webkit-fill-available;
}

${scoped(avKanban, " .av__container")} {
  overflow: hidden;
  width: -webkit-fill-available;
}

${scoped(sb, " > :first-child")} {
  margin-left: calc(${padLeft} * -1 + min(24px, ${padLeft}));
  transition: margin 0.2s;
}
${scoped(sb, " > :nth-last-child(1 of [data-node-id])")} {
  margin-right: calc(${padRight} * -1 + min(24px, ${padRight}));
  transition: margin 0.2s;
}

${scoped(table, " > div:first-child")} {
  display: block;
  box-sizing: border-box;
  width: calc(100% + ${padLeft} + ${padRight});
  margin-right: calc(${padRight} * -1);
  margin-left: calc(${padLeft} * -1);
  padding-left: 0;
  padding-right: 0;
  max-width: none;
  scrollbar-width: none;
}
${scoped(table, " > div:first-child::-webkit-scrollbar")} {
  display: none;
}
${scoped(table, " table")} {
  width: 100%;
  max-width: none;
  display: table;
  border-left: none;
  border-right: none;
}
`;

export class FullwidthStyles {
  constructor(private readonly targetDocument: Document = document) {}

  start(): void {
    const mounted = this.targetDocument.getElementById(FULLWIDTH_STYLE_ID);
    if (mounted) {
      if (mounted.textContent !== FULLWIDTH_CSS) mounted.textContent = FULLWIDTH_CSS;
      return;
    }

    const style = this.targetDocument.createElement("style");
    style.id = FULLWIDTH_STYLE_ID;
    style.textContent = FULLWIDTH_CSS;
    this.targetDocument.head.append(style);
  }

  destroy(): void {
    this.targetDocument.getElementById(FULLWIDTH_STYLE_ID)?.remove();
  }
}

// Themes that ship their own full-width implementation (the Asri theme, via
// its custom-afwd styling) always define --protyle-spacing on the editor;
// SiYuan itself and other themes never do. When the active theme handles the
// attribute natively, this module stands down to avoid duplicate block-menu
// entries and competing styles.
export function isThemeNativeAfwd(targetDocument: Document = document): boolean {
  const editor = targetDocument.querySelector(".protyle-wysiwyg");
  if (!editor) return false;
  return (targetDocument.defaultView?.getComputedStyle(editor).getPropertyValue("--protyle-spacing") ?? "").trim() !== "";
}

export function applyGlobalFullwidthScope(
  targetDocument: Document,
  enabled: boolean,
  excludedTypes: readonly string[] = [],
): void {
  const classList = targetDocument.documentElement.classList;
  classList.toggle(GLOBAL_SCOPE_CLASS, enabled);
  for (const docType of AFWD_DOC_KEYS) {
    if (docType === "all") continue;
    classList.toggle(
      `${GLOBAL_EXCLUDE_CLASS_PREFIX}${docType}`,
      enabled && excludedTypes.includes(docType),
    );
  }
}

/**
 * Keeps per-side editor padding custom properties in sync on every
 * .protyle-wysiwyg element so the full-width breakout is exact under any
 * theme (SiYuan ships asymmetric stock padding, e.g. 24px left / 16px right).
 */
export class FullwidthSpacingSync {
  private mutation: MutationObserver | null = null;
  private resize: ResizeObserver | null = null;
  private frame: number | null = null;
  private readonly tracked = new Set<HTMLElement>();

  constructor(private readonly targetDocument: Document = document) {}

  start(): void {
    if (this.mutation) return;
    this.syncEditors();
    this.resize = new ResizeObserver((entries) => {
      for (const entry of entries) this.apply(entry.target as HTMLElement);
    });
    for (const editor of this.tracked) this.resize.observe(editor);
    this.mutation = new MutationObserver(() => this.scheduleSync());
    this.mutation.observe(this.targetDocument.body, { childList: true, subtree: true });
  }

  stop(): void {
    this.mutation?.disconnect();
    this.mutation = null;
    this.resize?.disconnect();
    this.resize = null;
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    for (const editor of this.tracked) {
      editor.style.removeProperty(AFWD_PAD_LEFT_VAR);
      editor.style.removeProperty(AFWD_PAD_RIGHT_VAR);
    }
    this.tracked.clear();
  }

  private scheduleSync(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.syncEditors();
    });
  }

  private syncEditors(): void {
    const editors = this.targetDocument.querySelectorAll<HTMLElement>(".protyle-wysiwyg");
    for (const editor of Array.from(this.tracked)) {
      if (!editor.isConnected) {
        this.resize?.unobserve(editor);
        editor.style.removeProperty(AFWD_PAD_LEFT_VAR);
        editor.style.removeProperty(AFWD_PAD_RIGHT_VAR);
        this.tracked.delete(editor);
      }
    }
    for (const editor of editors) {
      if (this.tracked.has(editor)) continue;
      this.tracked.add(editor);
      this.apply(editor);
      this.resize?.observe(editor);
    }
  }

  private apply(editor: HTMLElement): void {
    const view = this.targetDocument.defaultView;
    if (!view) return;
    const style = view.getComputedStyle(editor);
    const left = `${Number.parseFloat(style.paddingLeft) || 0}px`;
    const right = `${Number.parseFloat(style.paddingRight) || 0}px`;
    if (editor.style.getPropertyValue(AFWD_PAD_LEFT_VAR) !== left) {
      editor.style.setProperty(AFWD_PAD_LEFT_VAR, left);
    }
    if (editor.style.getPropertyValue(AFWD_PAD_RIGHT_VAR) !== right) {
      editor.style.setProperty(AFWD_PAD_RIGHT_VAR, right);
    }
  }
}
