export const TABLE_FIT_STYLE_ID = "damophus-table-fit-style";

// Tables opted into the block-fullwidth module (custom-afwd, see
// lets-block-fullwidth) keep their natural column sizing: table-layout fixed
// would split columns evenly regardless of content, which looks broken on
// two-column tables. Doc-level attributes (all / t) exclude every table of
// the document; the block-level "on" attribute excludes a single table.
const FIT_BASE_SCOPE =
  '.protyle-wysiwyg:not([custom-afwd="all"]):not([custom-afwd~="t"]) [data-type="NodeTable"].table:not([custom-afwd="on"])';

// The module's "full width in all documents" toggle (html class, see
// lets-block-fullwidth) must not disable fitting: while it is on, the
// fullwidth breakout stylesheet widens the scroll container and the fit
// rules below simply size the table into that widened container. Only the
// container clamp has to stand aside, because the breakout widens that very
// container via negative margins; clamping it back to 100% would visibly
// misalign the breakout.
const FIT_SCOPE = FIT_BASE_SCOPE;
const FIT_CONTAINER_SCOPE = `html:not(.damophus-afwd-global) ${FIT_BASE_SCOPE}`;

const FIT_TABLE_SCOPE = `${FIT_SCOPE} > div:first-child > table`;

const FIT_SHARED_CSS = `
${FIT_SCOPE} {
  box-sizing: border-box !important;
  min-width: 0 !important;
  max-width: 100% !important;
}

${FIT_CONTAINER_SCOPE} > div:first-child {
  box-sizing: border-box !important;
  max-width: 100% !important;
}
`;

// Default mode: squeeze every table into the available width with an even
// fixed layout. Authored column widths are neutralized so long content wraps
// instead of stretching its column, and the column resize handle is hidden
// because dragging widths cannot stick under forced sizing.
export const TABLE_FIT_CSS = `
${FIT_SHARED_CSS}

${FIT_TABLE_SCOPE} {
  box-sizing: border-box !important;
  display: table !important;
  width: 100% !important;
  max-width: 100% !important;
  table-layout: fixed !important;
}

${FIT_TABLE_SCOPE} > colgroup > col,
${FIT_TABLE_SCOPE} th,
${FIT_TABLE_SCOPE} td {
  width: auto !important;
  min-width: 0 !important;
  max-width: none !important;
}

${FIT_TABLE_SCOPE} th,
${FIT_TABLE_SCOPE} td {
  white-space: normal !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
}

${FIT_TABLE_SCOPE} th > *,
${FIT_TABLE_SCOPE} td > * {
  max-width: 100% !important;
}

.protyle-wysiwyg [data-type="NodeTable"].table .table__resize {
  display: none !important;
}
`;

// Wide-scroll mode: over-wide tables keep their authored column widths and
// scroll horizontally in SiYuan's native wrapper (overflow-x: auto, which
// must never be overridden; the mobile touch handler probes its
// scrollWidth). max-content sizes the table to its natural width while the
// native per-cell max-width cap keeps long text wrapped; min-width: 100%
// still fills the editor for tables that fit. Column resize handling stays
// native because dragging widths is meaningful with natural sizing.
export const TABLE_SCROLL_CSS = `
${FIT_SHARED_CSS}

${FIT_TABLE_SCOPE} {
  box-sizing: border-box !important;
  width: max-content !important;
  min-width: 100% !important;
  max-width: none !important;
  table-layout: auto !important;
}
`;

export interface TableFitOptions {
  wideScroll: boolean;
}

export const buildTableFitCss = (options: TableFitOptions): string =>
  options.wideScroll ? TABLE_SCROLL_CSS : TABLE_FIT_CSS;

export class TableFitStyles {
  constructor(private readonly targetDocument: Document = document) {}

  start(options: TableFitOptions = { wideScroll: false }): void {
    const css = buildTableFitCss(options);
    const mounted = this.targetDocument.getElementById(TABLE_FIT_STYLE_ID);
    if (mounted) {
      if (mounted.textContent !== css) mounted.textContent = css;
      return;
    }

    const style = this.targetDocument.createElement("style");
    style.id = TABLE_FIT_STYLE_ID;
    style.textContent = css;
    this.targetDocument.head.append(style);
  }

  destroy(): void {
    this.targetDocument.getElementById(TABLE_FIT_STYLE_ID)?.remove();
  }
}
