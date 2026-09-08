import { parseIal } from "../../question-bank/markdown/ial";

const nodeIdPattern = /^\d{14}-[a-z0-9]{7}$/u;
export const EMPTY_SOURCE_EMBED_SQL = "SELECT * FROM blocks WHERE 1 = 0";

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

export type SourceEmbedSection = "stem" | "solution";

export interface SourceEmbedSelectionOptions {
  hideEmptySolutionBlocks?: boolean;
}

export interface SourceEmbedChildrenLoader {
  /** SiYuan getChildBlocks returns the complete descendant list in display order. */
  loadChildren(blockId: string): Promise<readonly { id: string }[] | null | undefined>;
  loadRows(blockIds: readonly string[]): Promise<readonly SourceEmbedBlockRow[]>;
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

const emptyFilterTypes = new Set(["p", "l", "i", "t"]);

function hasVisibleBlockContent(row: SourceEmbedBlockRow): boolean {
  const source = row.markdown ?? row.content ?? "";
  if (/!\[[^\]]*\]\(|<(?:audio|canvas|iframe|img|video)\b|\$\$|```/iu.test(source)) return true;
  const normalized = source
    .replace(/\{:\s[^}]*\}/gu, "")
    .replace(/&nbsp;|&#160;|\u00a0|\u200b|\ufeff/giu, "")
    .replace(/<br\s*\/?>/giu, "")
    .replace(/<[^>]+>/gu, "")
    .replace(/^\s*(?:[-+*]|\d+[.)])\s*/gmu, "")
    .replace(/[|:\-[\]()]/gu, "")
    .trim();
  return normalized.length > 0;
}

function isEmptyDisplayBlock(
  row: SourceEmbedBlockRow,
  byParent: Map<string, SourceEmbedBlockRow[]>,
): boolean {
  if (!emptyFilterTypes.has(row.type ?? "")) return false;
  if (hasVisibleBlockContent(row)) return false;
  return (byParent.get(row.id) ?? []).every((child) => isEmptyDisplayBlock(child, byParent));
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

/** Load only the selected question subtree, preserving SiYuan's actual child order. */
export async function loadSourceEmbedRows(
  questionBlockId: string,
  loader: SourceEmbedChildrenLoader,
): Promise<SourceEmbedBlockRow[]> {
  const orderedIds: string[] = [];
  const visited = new Set<string>([questionBlockId]);
  const visit = async (parentId: string): Promise<void> => {
    for (const child of await loader.loadChildren(parentId) ?? []) {
      if (!nodeIdPattern.test(child.id) || visited.has(child.id)) continue;
      visited.add(child.id);
      orderedIds.push(child.id);
      await visit(child.id);
    }
  };
  await visit(questionBlockId);

  const rows = await loader.loadRows([questionBlockId, ...orderedIds]);
  const orderById = new Map(orderedIds.map((id, order) => [id, order]));
  return rows.map((row) => ({ ...row, order: orderById.get(row.id) }));
}

/** Resolve only the current question's stem text and solution subtree. */
export function sourceEmbedBlockIds(
  rows: readonly SourceEmbedBlockRow[],
  questionBlockId: string,
  section: SourceEmbedSection = "stem",
  options: SourceEmbedSelectionOptions = {},
): string[] {
  if (!nodeIdPattern.test(questionBlockId)) return [questionBlockId];
  const byParent = buildChildren(rows);
  const question = rows.find((row) => row.id === questionBlockId);
  if (!question) return [questionBlockId];
  const byId = new Map(rows.map((row) => [row.id, row]));

  const subtree = descendants(question, byParent);
  const answerLabel = /^(?:综合考向|答案(?:与解析)?|参考答案|正确答案|解析|参考解析|评分要点)\s*(?:[:：]|为|是|$)/iu;
  let solutionIndex = subtree.findIndex((row) => (
    row.id !== questionBlockId && attributes(row)["custom-qb-section"] === "solution"
  ));
  if (solutionIndex < 0) {
    // A case card writes no marker: the nested `{: …}` line would break the
    // flashcard front/back boundary. Infer the boundary from the first
    // answer-shaped descendant instead.
    solutionIndex = subtree.findIndex((row, index) => index > 0
      && ["i", "l", "p", "h"].includes(row.type ?? "")
      && answerLabel.test(blockText(row)));
  }
  // Ascend from the boundary to the highest "solution-pure" container. Blocks that
  // merely precede the marker inside an answer heading (images, sub-headings) stay in
  // the solution, so climb while the ancestor holds no option-shaped row before the
  // boundary. Stop at a mixed container - the case-card item that also holds the stem
  // paragraph and the option callout - so its inner answer list becomes the section
  // root while its stem part stays in the stem.
  let pureRoot = solutionIndex >= 0 ? subtree[solutionIndex] : undefined;
  for (let guard = 0; pureRoot && guard < 64; guard += 1) {
    const parent = byId.get(pureRoot.parent_id ?? "");
    if (!parent || parent.id === questionBlockId) break;
    const parentSubtree = descendants(parent, byParent);
    const boundaryAt = parentSubtree.findIndex((row) => row.id === pureRoot!.id);
    if (parentSubtree.slice(0, Math.max(boundaryAt, 0)).some(looksLikeOption)) break;
    pureRoot = parent;
  }
  const siblingsFrom = (row: SourceEmbedBlockRow): SourceEmbedBlockRow[] => {
    const parent = byId.get(row.parent_id ?? "");
    const siblings = parent ? (byParent.get(parent.id) ?? []) : [];
    const index = siblings.findIndex((item) => item.id === row.id);
    return index >= 0 ? siblings.slice(index) : [row];
  };
  const solutionRoots: SourceEmbedBlockRow[] = pureRoot ? siblingsFrom(pureRoot) : [];
  if (pureRoot) {
    // A mixed ancestor keeps its prefix in the stem, but everything after it
    // (metadata blocks, later sections) still belongs to the solution.
    let ancestor = byId.get(pureRoot.parent_id ?? "");
    for (let guard = 0; ancestor && ancestor.id !== questionBlockId && guard < 64; guard += 1) {
      solutionRoots.push(...siblingsFrom(ancestor).slice(1));
      ancestor = byId.get(ancestor.parent_id ?? "");
    }
  }
  const solutionRootIndex = pureRoot
    ? subtree.findIndex((row) => row.id === pureRoot!.id)
    : -1;
  const stemRows = solutionRootIndex < 0 ? subtree.slice(1) : subtree.slice(1, solutionRootIndex);
  const optionRoots = stemRows.filter(looksLikeOption);
  const optionIds = new Set<string>();
  const optionAncestors = new Set<string>();
  for (const optionRoot of optionRoots) {
    for (const row of descendants(optionRoot, byParent)) optionIds.add(row.id);
    let parent = optionRoot.parent_id;
    while (parent && parent !== questionBlockId) {
      optionAncestors.add(parent);
      parent = byId.get(parent)?.parent_id;
    }
  }

  const selected: string[] = [];
  if (section === "solution" && solutionIndex < 0) return [];
  if (section === "solution" && solutionIndex >= 0) {
    // Mount only section roots: Protyle renders each root's descendants, so
    // mounting children separately would duplicate answer lists, diagrams,
    // and callouts.
    for (const row of solutionRoots) {
      if (options.hideEmptySolutionBlocks && isEmptyDisplayBlock(row, byParent)) continue;
      selected.push(row.id);
    }
    if (options.hideEmptySolutionBlocks && selected.length === 0) return [];
    return selected.length > 0 ? selected : [questionBlockId];
  }
  for (const row of stemRows) {
    if (optionIds.has(row.id) || optionAncestors.has(row.id)) continue;
    if ((byParent.get(row.id)?.length ?? 0) === 0) selected.push(row.id);
  }
  return selected.length > 0 ? selected : [questionBlockId];
}

export function sourceEmbedSubtreeIds(
  rows: readonly SourceEmbedBlockRow[],
  rootBlockId: string,
): string[] {
  const root = rows.find((row) => row.id === rootBlockId);
  if (!root) return [rootBlockId];
  return descendants(root, buildChildren(rows)).map((row) => row.id);
}

export function sourceEmbedSql(
  rows: readonly SourceEmbedBlockRow[],
  questionBlockId: string,
  section: SourceEmbedSection = "stem",
  options: SourceEmbedSelectionOptions = {},
): string {
  const ids = sourceEmbedBlockIds(rows, questionBlockId, section, options);
  if (ids.length === 0) return EMPTY_SOURCE_EMBED_SQL;
  const ordering = ids.map((id, index) => `WHEN ${quote(id)} THEN ${index}`).join(" ");
  return `SELECT * FROM blocks WHERE id IN (${ids.map(quote).join(", ")}) ORDER BY CASE id ${ordering} ELSE ${ids.length} END`;
}
