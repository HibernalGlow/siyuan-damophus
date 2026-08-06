import { parseIal } from "../question-bank/markdown/ial";

const nodeIdPattern = /^\d{14}-[a-z0-9]{7}$/u;

export interface SourceEmbedBlockRow {
  id: string;
  root_id?: string;
  parent_id?: string;
  sort?: number | string;
  path?: string;
  type?: string;
  subtype?: string;
  content?: string;
  markdown?: string;
  ial?: string;
  order?: number;
}

function sortValue(value: number | string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function attributes(row: SourceEmbedBlockRow): Record<string, string> {
  return parseIal(row.ial ?? "")?.attributes ?? {};
}

function blockText(row: SourceEmbedBlockRow): string {
  return (row.markdown ?? row.content ?? "").replace(/\s+/gu, " ").trim();
}

function looksLikeOption(row: SourceEmbedBlockRow): boolean {
  const attrs = attributes(row);
  if (attrs["custom-qb-option"] !== undefined) return true;
  return /^(?:\[[ xX]\]\s*)?[A-D](?:[.)]|\s)/u.test(blockText(row));
}

function buildChildren(rows: readonly SourceEmbedBlockRow[]): Map<string, SourceEmbedBlockRow[]> {
  const byParent = new Map<string, SourceEmbedBlockRow[]>();
  const knownIds = new Set(rows.map((row) => row.id));
  for (const row of rows) {
    const parent = row.parent_id && knownIds.has(row.parent_id) ? row.parent_id : "";
    const siblings = byParent.get(parent) ?? [];
    siblings.push(row);
    byParent.set(parent, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((left, right) => (
      (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER)
      || sortValue(left.sort) - sortValue(right.sort)
      || left.id.localeCompare(right.id)
    ));
  }
  return byParent;
}

function preorder(root: SourceEmbedBlockRow, byParent: Map<string, SourceEmbedBlockRow[]>): SourceEmbedBlockRow[] {
  const result: SourceEmbedBlockRow[] = [];
  const visit = (row: SourceEmbedBlockRow): void => {
    result.push(row);
    for (const child of byParent.get(row.id) ?? []) visit(child);
  };
  visit(root);
  return result;
}

function descendants(row: SourceEmbedBlockRow, byParent: Map<string, SourceEmbedBlockRow[]>): SourceEmbedBlockRow[] {
  return preorder(row, byParent);
}

function quote(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}

/** Resolve only the current question's stem text and solution subtree. */
export function sourceEmbedBlockIds(
  rows: readonly SourceEmbedBlockRow[],
  questionBlockId: string,
): string[] {
  if (!nodeIdPattern.test(questionBlockId)) return [questionBlockId];
  const byParent = buildChildren(rows);
  const question = rows.find((row) => row.id === questionBlockId);
  if (!question) return [questionBlockId];

  const subtree = descendants(question, byParent);
  const solutionIndex = subtree.findIndex((row) => (
    row.id !== questionBlockId && attributes(row)["custom-qb-section"] === "solution"
  ));
  const stemRows = solutionIndex < 0 ? subtree.slice(1) : subtree.slice(1, solutionIndex);
  const optionRoots = stemRows.filter(looksLikeOption);
  const optionIds = new Set<string>();
  const optionAncestors = new Set<string>();
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const optionRoot of optionRoots) {
    for (const row of descendants(optionRoot, byParent)) optionIds.add(row.id);
    let parent = optionRoot.parent_id;
    while (parent && parent !== questionBlockId) {
      optionAncestors.add(parent);
      parent = byId.get(parent)?.parent_id;
    }
  }

  const selected: string[] = [];
  for (const row of stemRows) {
    if (optionIds.has(row.id) || optionAncestors.has(row.id)) continue;
    if ((byParent.get(row.id)?.length ?? 0) === 0) selected.push(row.id);
  }
  if (solutionIndex >= 0) {
    for (const row of subtree.slice(solutionIndex)) {
      if (row.parent_id === questionBlockId) selected.push(row.id);
    }
  }
  return selected.length > 0 ? selected : [questionBlockId];
}

export function sourceEmbedSql(rows: readonly SourceEmbedBlockRow[], questionBlockId: string): string {
  const ids = sourceEmbedBlockIds(rows, questionBlockId);
  const ordering = ids.map((id, index) => `WHEN ${quote(id)} THEN ${index}`).join(" ");
  return `SELECT * FROM blocks WHERE id IN (${ids.map(quote).join(", ")}) ORDER BY CASE id ${ordering} ELSE ${ids.length} END`;
}
