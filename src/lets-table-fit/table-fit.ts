export const TABLE_FIT_STYLE_ID = "damophus-table-fit-style";

// Tables opted into the block-fullwidth module (custom-afwd, see
// lets-block-fullwidth) keep their natural column sizing: table-layout fixed
// would split columns evenly regardless of content, which looks broken on
// two-column tables. Doc-level attributes (all / t) exclude every table of
// the document; the block-level "on" attribute excludes a single table. The
// html class is that module's "full width in all documents" toggle, which
// excludes every table while it is on.
const FIT_SCOPE =
  'html:not(.damophus-afwd-global) .protyle-wysiwyg:not([custom-afwd="all"]):not([custom-afwd~="t"]) [data-type="NodeTable"].table:not([custom-afwd="on"])';

export const TABLE_FIT_CSS = `
${FIT_SCOPE} {
  box-sizing: border-box !important;
  min-width: 0 !important;
  max-width: 100% !important;
}

${FIT_SCOPE} > div:first-child {
  box-sizing: border-box !important;
  max-width: 100% !important;
}

${FIT_SCOPE} > div:first-child > table {
  box-sizing: border-box !important;
  display: table !important;
  width: 100% !important;
  max-width: 100% !important;
  table-layout: fixed !important;
}

${FIT_SCOPE} > div:first-child > table > colgroup > col,
${FIT_SCOPE} > div:first-child > table th,
${FIT_SCOPE} > div:first-child > table td {
  width: auto !important;
  min-width: 0 !important;
  max-width: none !important;
}

${FIT_SCOPE} > div:first-child > table th,
${FIT_SCOPE} > div:first-child > table td {
  white-space: normal !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
}

${FIT_SCOPE} > div:first-child > table th > *,
${FIT_SCOPE} > div:first-child > table td > * {
  max-width: 100% !important;
}

.protyle-wysiwyg [data-type="NodeTable"].table .table__resize {
  display: none !important;
}
`;

export class TableFitStyles {
  constructor(private readonly targetDocument: Document = document) {}

  start(): void {
    const mounted = this.targetDocument.getElementById(TABLE_FIT_STYLE_ID);
    if (mounted) {
      if (mounted.textContent !== TABLE_FIT_CSS) mounted.textContent = TABLE_FIT_CSS;
      return;
    }

    const style = this.targetDocument.createElement("style");
    style.id = TABLE_FIT_STYLE_ID;
    style.textContent = TABLE_FIT_CSS;
    this.targetDocument.head.append(style);
  }

  destroy(): void {
    this.targetDocument.getElementById(TABLE_FIT_STYLE_ID)?.remove();
  }
}
