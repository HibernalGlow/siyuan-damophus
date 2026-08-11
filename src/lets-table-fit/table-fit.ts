export const TABLE_FIT_STYLE_ID = "damophus-table-fit-style";

export const TABLE_FIT_CSS = `
.protyle-wysiwyg [data-type="NodeTable"].table {
  box-sizing: border-box !important;
  min-width: 0 !important;
  max-width: 100% !important;
}

.protyle-wysiwyg [data-type="NodeTable"].table > div:first-child {
  box-sizing: border-box !important;
  max-width: 100% !important;
  overflow-x: hidden !important;
  overflow-x: clip !important;
}

.protyle-wysiwyg [data-type="NodeTable"].table > div:first-child > table {
  box-sizing: border-box !important;
  display: table !important;
  width: 100% !important;
  max-width: 100% !important;
  table-layout: fixed !important;
}

.protyle-wysiwyg [data-type="NodeTable"].table > div:first-child > table > colgroup > col,
.protyle-wysiwyg [data-type="NodeTable"].table > div:first-child > table th,
.protyle-wysiwyg [data-type="NodeTable"].table > div:first-child > table td {
  width: auto !important;
  min-width: 0 !important;
  max-width: none !important;
}

.protyle-wysiwyg [data-type="NodeTable"].table > div:first-child > table th,
.protyle-wysiwyg [data-type="NodeTable"].table > div:first-child > table td {
  white-space: normal !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
}

.protyle-wysiwyg [data-type="NodeTable"].table > div:first-child > table th > *,
.protyle-wysiwyg [data-type="NodeTable"].table > div:first-child > table td > * {
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
