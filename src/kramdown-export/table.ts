interface TableCell {
  element: HTMLTableCellElement;
  row: number;
  column: number;
  colspan: number;
  rowspan: number;
}

function spanValue(cell: HTMLTableCellElement, name: "colspan" | "rowspan"): number {
  const value = Number.parseInt(cell.getAttribute(name) ?? "1", 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function cellContent(cell: HTMLTableCellElement): string {
  const html = cell.innerHTML
    .replace(/<br\s*\/?>/giu, "<br />")
    .replace(/\r?\n/gu, " ")
    .trim();
  // SiYuan places a duplicate merge IAL at the beginning of rendered cells.
  return html.replace(/^\s*\{:\s*(?=[^}]*\b(?:colspan|rowspan)\b)[^}]*\}\s*/u, "");
}

function escapePipe(value: string): string {
  return value.replace(/(?<!\\)\|/gu, "\\|");
}

function cellIal(cell: TableCell): string {
  const attributes: string[] = [];
  if (cell.colspan > 1) attributes.push(`colspan="${cell.colspan}"`);
  if (cell.rowspan > 1) attributes.push(`rowspan="${cell.rowspan}"`);
  for (const name of ["align", "style", "class"]) {
    const value = cell.element.getAttribute(name);
    if (value) attributes.push(`${name}="${value.replace(/"/gu, "&quot;")}"`);
  }
  return attributes.length > 0 ? ` {: ${attributes.join(" ")}}` : "";
}

function tableWidth(rows: readonly TableCell[][]): number {
  return rows.reduce((width, row) => row.reduce((rowWidth, cell) => (
    Math.max(rowWidth, cell.column + cell.colspan)
  ), width), 0);
}

function renderCell(cell: TableCell | undefined, covered: boolean): string {
  if (!cell || covered) return "{: class=\"fn__none\"}";
  return `${escapePipe(cellContent(cell.element))}${cellIal(cell)}`;
}

function convertTable(table: HTMLTableElement): string {
  const rows = [...table.rows];
  const placements: TableCell[][] = [];
  const occupied: Array<Array<TableCell | undefined>> = [];
  rows.forEach((rowElement, rowIndex) => {
    const row: TableCell[] = [];
    let column = 0;
    for (const element of [...rowElement.cells]) {
      while (occupied[rowIndex]?.[column]) column += 1;
      const cell: TableCell = {
        element,
        row: rowIndex,
        column,
        colspan: spanValue(element, "colspan"),
        rowspan: spanValue(element, "rowspan"),
      };
      row.push(cell);
      for (let r = rowIndex; r < rowIndex + cell.rowspan; r += 1) {
        occupied[r] ??= [];
        for (let c = column; c < column + cell.colspan; c += 1) occupied[r][c] = cell;
      }
      column += cell.colspan;
    }
    placements[rowIndex] = row;
  });

  const declaredWidth = table.querySelectorAll(":scope > colgroup > col").length;
  const width = declaredWidth || tableWidth(placements);
  if (width === 0 || placements.length === 0) return "";
  const lines = placements.map((_row, rowIndex) => {
    const cells: string[] = [];
    for (let column = 0; column < width; column += 1) {
      const cell = occupied[rowIndex]?.[column];
      const origin = cell?.row === rowIndex && cell.column === column;
      cells.push(renderCell(cell, !origin));
    }
    return `| ${cells.join(" | ")} |`;
  });
  lines.splice(1, 0, `| ${Array.from({ length: width }, () => "---").join(" | ")} |`);
  lines.push(`{: colgroup="${"|".repeat(Math.max(0, width - 1))}"}`);
  return lines.join("\n");
}

/** Converts SiYuan's rendered native table Kramdown back to pipe Markdown. */
export function convertHtmlTablesToMarkdown(kramdown: string): string {
  if (typeof DOMParser === "undefined") {
    throw new Error("A DOM parser is required to convert SiYuan tables");
  }
  const convertSource = (source: string): string => {
    const document = new DOMParser().parseFromString(source, "text/html");
    const table = document.querySelector("table");
    return table ? convertTable(table) : source;
  };
  const lines = kramdown.split("\n");
  const output: string[] = [];
  let fence: string | undefined;
  let table: string[] | undefined;
  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(?:>\s*)*(`{3,}|~{3,})/u);
    if (!table && fenceMatch) {
      const marker = fenceMatch[1][0];
      fence = fence ? (fence === marker ? undefined : fence) : marker;
      output.push(line);
      continue;
    }
    if (fence) {
      output.push(line);
      continue;
    }
    if (table) {
      table.push(line);
      if (/<\/table\s*>/iu.test(line)) {
        output.push(convertSource(table.join("\n")));
        table = undefined;
      }
      continue;
    }
    if (/<table\b/iu.test(line)) {
      if (/<\/table\s*>/iu.test(line)) output.push(convertSource(line));
      else table = [line];
      continue;
    }
    output.push(line);
  }
  if (table) output.push(...table);
  // getBlockKramdown already emits the table colgroup as the following block IAL.
  // Remove only the generated duplicate and keep the original IAL for filtering.
  return output.join("\n").replace(
    /(^|\n)\{: colgroup="[^"]*"\}\n(?=\{: [^}\n]*\bcolgroup="[^"]*"[^}\n]*\})/gu,
    "$1",
  );
}
