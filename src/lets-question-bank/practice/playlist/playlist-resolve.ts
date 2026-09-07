import type { QuestionCatalogEntry } from "@/question-bank/assembly";
import { filterQuestions } from "@/question-bank/core/scope";
import type { Question } from "@/question-bank/core/types";
import { getAttributeView } from "@/question-bank/adapters/siyuan/binding/attribute-view";
import type { SiyuanKernelClient } from "@/question-bank/adapters/siyuan/types";
import type { HydratedQuestionSource } from "@/question-bank/adapters/siyuan/source-catalog";
import type { PracticePlaylist } from "./playlist-schema";
import type { DocumentScanBundle } from "../../tinybase-catalog-runtime";

export type { DocumentScanBundle };

export type PlaylistUnresolvedReason =
  | "unbound-row"
  | "not-indexed"
  | "doc-unavailable"
  | "unsupported-block";

export interface PlaylistUnresolved {
  blockId: string;
  reason: PlaylistUnresolvedReason;
  /** Row of the point database that led to this target, when known. */
  rowItemId?: string;
  /** Column that contributed the target, when known. */
  keyId?: string;
}

export interface PlaylistBlockHit {
  blockId: string;
  questionCount: number;
  questionIds: string[];
  /** Set for a primary-column row whose bound block is missing. */
  unbound?: PlaylistUnresolvedReason;
}

export interface PlaylistColumnReport {
  keyId: string;
  keyName: string;
  kind: "primary" | "relation";
  /** Blocks contributed by this column, in row order. */
  blocks: PlaylistBlockHit[];
  /** Relation targets without a bound block in the target database. */
  unboundCount: number;
}

export interface PlaylistRowReport {
  rowItemId: string;
  title: string;
  totalQuestions: number;
  columns: PlaylistColumnReport[];
}

export interface PlaylistResolution {
  playlistId: string;
  questionIds: string[];
  questions: Question[];
  blockIdsByQuestionId: ReadonlyMap<string, string>;
  rows: PlaylistRowReport[];
  unresolved: PlaylistUnresolved[];
}

export interface PlaylistResolveDeps {
  client: SiyuanKernelClient;
  loadCatalog(): Promise<QuestionCatalogEntry[]>;
  loadDocumentBundle(documentId: string): Promise<DocumentScanBundle | undefined>;
  listDocumentTreeIds(documentId: string): Promise<string[]>;
  hydrateQuestionSources(
    questionIds: readonly string[],
  ): Promise<Pick<HydratedQuestionSource, "questions" | "blockIdsByQuestionId">>;
}

/** Metadata of a user database, used by the playlist manager for configuration. */
export interface PlaylistAttributeViewMeta {
  avId: string;
  name: string;
  keys: Array<{
    id: string;
    name: string;
    type: string;
    relationAvId?: string;
    /** Primary (block-bound) column: its rows carry the block to scan directly. */
    isPrimary?: boolean;
  }>;
  views: Array<{ id: string; name: string; type: string }>;
}

export interface PlaylistAttributeViewResult {
  avId: string;
  avName: string;
  blockId: string;
  hPath: string;
}

const NODE_ID_PATTERN = /^\d{14}-[a-z0-9]{7}$/u;
const RENDER_PAGE_SIZE = 100000;
const RENDER_MAX_PAGES = 20;

interface RenderedViewLike {
  rows?: Array<{ id?: string }>;
  cards?: Array<{ id?: string }>;
  groups?: Array<{ rows?: Array<{ id?: string }>; cards?: Array<{ id?: string }> }>;
  rowCount?: number;
  cardCount?: number;
}

function collectRenderedIds(view: RenderedViewLike, into: string[]): void {
  for (const row of view.rows ?? []) if (row.id) into.push(row.id);
  for (const card of view.cards ?? []) if (card.id) into.push(card.id);
  for (const group of view.groups ?? []) {
    for (const row of group.rows ?? []) if (row.id) into.push(row.id);
    for (const card of group.cards ?? []) if (card.id) into.push(card.id);
  }
}

/**
 * Row item IDs of a specific view. The kernel applies the view's saved filters
 * during rendering, so this is the authoritative "rows selected by the view".
 * The default page size is 50, so a large page size is requested explicitly and
 * pagination guards against kernel-side clamping.
 */
async function renderRowItemIds(client: SiyuanKernelClient, avId: string, viewId: string): Promise<string[]> {
  const collected: string[] = [];
  for (let page = 1; page <= RENDER_MAX_PAGES; page += 1) {
    const response = await client.request<{ view?: RenderedViewLike }>("/api/av/renderAttributeView", {
      id: avId,
      viewID: viewId,
      page,
      pageSize: RENDER_PAGE_SIZE,
      query: "",
      createIfNotExist: false,
    });
    const view = response?.view;
    if (!view) break;
    collectRenderedIds(view, collected);
    const total = view.rowCount ?? view.cardCount;
    if (total === undefined || collected.length >= total) break;
  }
  return collected;
}

interface PointKeyMeta {
  keyId: string;
  keyName: string;
  kind: "primary" | "relation";
}

interface PointRowTargets {
  keys: PointKeyMeta[];
  primaryKeyId?: string;
  targetAvIds: string[];
  rows: Array<{
    itemId: string;
    title: string;
    /** Primary/bind columns: bound block ids, keyed by column id. */
    directBlockIdsByKey: Map<string, string[]>;
    /** Relation columns: target row item ids, keyed by column id. */
    targetItemIdsByKey: Map<string, string[]>;
    /** Set when a selected primary column has no block bound to this row. */
    unboundPrimaryKey?: boolean;
  }>;
}

async function readPointRowTargets(client: SiyuanKernelClient, playlist: PracticePlaylist): Promise<PointRowTargets> {
  const av = await getAttributeView(client, playlist.point_av_id);
  const rowIdSet = playlist.view_id
    ? new Set(await renderRowItemIds(client, av.id, playlist.view_id))
    : undefined;
  const primaryKey = av.keyValues.find((entry) => entry.key.type === "block");
  const rows = new Map<string, {
    itemId: string;
    title: string;
    directBlockIdsByKey: Map<string, string[]>;
    targetItemIdsByKey: Map<string, string[]>;
    unboundPrimaryKey?: boolean;
  }>();
  for (const value of primaryKey?.values ?? []) {
    if (rowIdSet && !rowIdSet.has(value.blockID)) continue;
    rows.set(value.blockID, {
      itemId: value.blockID,
      title: value.block?.content ?? value.text?.content ?? "",
      directBlockIdsByKey: new Map(),
      targetItemIdsByKey: new Map(),
    });
  }
  const keys: PointKeyMeta[] = [];
  const targetAvIds: string[] = [];
  for (const keyId of playlist.relation_key_ids) {
    const entry = av.keyValues.find((item) => item.key.id === keyId);
    if (!entry) continue;
    const kind = entry.key.type === "block" ? "primary" as const : "relation" as const;
    keys.push({ keyId, keyName: entry.key.name || keyId, kind });
    // Primary/bind column: the block bound to the row itself is the target.
    if (kind === "primary") {
      for (const value of entry.values) {
        const row = rows.get(value.blockID);
        if (!row) continue;
        const boundBlockId = value.block?.id;
        if (!boundBlockId) {
          row.unboundPrimaryKey = true;
          continue;
        }
        const list = row.directBlockIdsByKey.get(keyId) ?? [];
        if (!list.includes(boundBlockId)) list.push(boundBlockId);
        row.directBlockIdsByKey.set(keyId, list);
      }
      continue;
    }
    const relationAvId = entry.key.relation?.avID;
    if (relationAvId && !targetAvIds.includes(relationAvId)) targetAvIds.push(relationAvId);
    for (const value of entry.values) {
      const row = rows.get(value.blockID);
      if (!row) continue;
      const list = row.targetItemIdsByKey.get(keyId) ?? [];
      for (const targetId of value.relation?.blockIDs ?? []) {
        if (!list.includes(targetId)) list.push(targetId);
      }
      row.targetItemIdsByKey.set(keyId, list);
    }
  }
  return { keys, primaryKeyId: primaryKey?.key.id, targetAvIds, rows: [...rows.values()] };
}

/** Target row item id -> bound block id. Rows without a bound block stay unmapped. */
async function readTargetBlocks(
  client: SiyuanKernelClient,
  targetAvIds: readonly string[],
): Promise<Map<string, string>> {
  const blockByItemId = new Map<string, string>();
  for (const avId of targetAvIds) {
    const av = await getAttributeView(client, avId);
    const primaryKey = av.keyValues.find((entry) => entry.key.type === "block");
    for (const value of primaryKey?.values ?? []) {
      const boundBlockId = value.block?.id;
      if (boundBlockId) blockByItemId.set(value.blockID, boundBlockId);
    }
  }
  return blockByItemId;
}

async function lookupBlockRoots(
  client: SiyuanKernelClient,
  blockIds: readonly string[],
): Promise<Array<{ id: string; type?: string; root_id?: string }>> {
  const safeIds = blockIds.filter((id) => NODE_ID_PATTERN.test(id));
  if (safeIds.length === 0) return [];
  const list = safeIds.map((id) => `'${id}'`).join(",");
  const rows = await client.request<Array<{ id: string; type?: string; root_id?: string }>>("/api/query/sql", {
    stmt: `SELECT id, type, root_id FROM blocks WHERE id IN (${list})`,
  });
  return rows ?? [];
}

export interface PlaylistRowTarget {
  rowItemId: string;
  rowTitle: string;
  /** Column that contributed these blocks, when known. */
  keyId?: string;
  keyName?: string;
  kind?: "primary" | "relation";
  blockIds: string[];
}

export interface PlaylistConvergenceInput {
  rowTargets: PlaylistRowTarget[];
  catalogByBlockId: ReadonlyMap<string, QuestionCatalogEntry>;
  entriesByDocumentId: ReadonlyMap<string, readonly QuestionCatalogEntry[]>;
  documentTargetIds: ReadonlySet<string>;
  rootDocumentByBlockId: ReadonlyMap<string, string>;
  bundlesByDocumentId: ReadonlyMap<string, DocumentScanBundle | undefined>;
  treeIdsByDocumentId: ReadonlyMap<string, readonly string[]>;
}

export interface PlaylistConvergenceResult {
  hitsByBlockId: ReadonlyMap<string, readonly string[]>;
  unionQuestionIds: string[];
  unresolved: PlaylistUnresolved[];
}

/**
 * Pure classification of target block ids into question IDs. Only the relations
 * listed in the playlist config are followed; every other column of the point
 * database is ignored. Catalog presence decides membership: questions must be
 * indexed, otherwise they are reported as unresolved.
 */
export function convergePlaylistTargets(input: PlaylistConvergenceInput): PlaylistConvergenceResult {
  const hitsByBlockId = new Map<string, string[]>();
  const unionQuestionIds: string[] = [];
  const seenQuestionIds = new Set<string>();
  const unresolved: PlaylistUnresolved[] = [];
  const unresolvedSeen = new Set<string>();

  const addHit = (blockId: string, questionId: string): void => {
    const list = hitsByBlockId.get(blockId) ?? [];
    if (!list.includes(questionId)) list.push(questionId);
    hitsByBlockId.set(blockId, list);
    if (!seenQuestionIds.has(questionId)) {
      seenQuestionIds.add(questionId);
      unionQuestionIds.push(questionId);
    }
  };
  const addUnresolved = (
    target: PlaylistRowTarget,
    blockId: string,
    reason: PlaylistUnresolvedReason,
  ): void => {
    const key = `${reason}:${blockId}:${target.rowItemId}:${target.keyId ?? ""}`;
    if (unresolvedSeen.has(key)) return;
    unresolvedSeen.add(key);
    unresolved.push({
      blockId,
      reason,
      rowItemId: target.rowItemId,
      keyId: target.keyId,
    });
  };

  for (const target of input.rowTargets) {
    for (const blockId of target.blockIds) {
      if (hitsByBlockId.has(blockId)) continue;
      const direct = input.catalogByBlockId.get(blockId);
      if (direct) {
        addHit(blockId, direct.questionId);
        continue;
      }
      if (input.documentTargetIds.has(blockId)) {
        const treeIds = input.treeIdsByDocumentId.get(blockId) ?? [blockId];
        for (const documentId of treeIds) {
          const entries = input.entriesByDocumentId.get(documentId);
          if (!entries || entries.length === 0) {
            addUnresolved(target, documentId, "not-indexed");
            continue;
          }
          for (const entry of entries) addHit(blockId, entry.questionId);
        }
        continue;
      }
      const rootDocumentId = input.rootDocumentByBlockId.get(blockId);
      if (!rootDocumentId) {
        addUnresolved(target, blockId, "unsupported-block");
        continue;
      }
      const entries = input.entriesByDocumentId.get(rootDocumentId);
      if (!entries || entries.length === 0) {
        addUnresolved(target, rootDocumentId, "not-indexed");
        continue;
      }
      const bundle = input.bundlesByDocumentId.get(rootDocumentId);
      if (!bundle) {
        addUnresolved(target, rootDocumentId, "doc-unavailable");
        continue;
      }
      const topicId = bundle.topicIdByBlockId.get(blockId);
      if (!topicId) {
        addUnresolved(target, blockId, "unsupported-block");
        continue;
      }
      const catalogIds = new Set(entries.map((entry) => entry.questionId));
      const subtree = filterQuestions({
        questions: bundle.questions,
        topics: bundle.topics,
        rootTopicId: topicId,
        filter: "all",
      });
      const matched = subtree.filter((question) => catalogIds.has(question.id));
      if (matched.length === 0) {
        addUnresolved(target, blockId, "unsupported-block");
        continue;
      }
      for (const question of matched) addHit(blockId, question.id);
    }
  }
  return { hitsByBlockId, unionQuestionIds, unresolved };
}

export interface PlaylistResolveOptions {
  /**
   * Skip question hydration. The preview only needs ids, counts, and traces;
   * the full practice session resolves with hydration enabled.
   */
  hydrate?: boolean;
}

export async function resolvePlaylistQuestions(
  deps: PlaylistResolveDeps,
  playlist: PracticePlaylist,
  options: PlaylistResolveOptions = {},
): Promise<PlaylistResolution> {
  const pointRows = await readPointRowTargets(deps.client, playlist);
  const blockByTargetItemId = await readTargetBlocks(deps.client, pointRows.targetAvIds);

  const catalog = await deps.loadCatalog();
  const catalogByBlockId = new Map(catalog.map((entry) => [entry.blockId, entry]));
  const entriesByDocumentId = new Map<string, QuestionCatalogEntry[]>();
  for (const entry of catalog) {
    const list = entriesByDocumentId.get(entry.documentId) ?? [];
    list.push(entry);
    entriesByDocumentId.set(entry.documentId, list);
  }

  const rowTargets: PlaylistRowTarget[] = [];
  const unresolved: PlaylistUnresolved[] = [];
  for (const row of pointRows.rows) {
    for (const key of pointRows.keys) {
      const context = {
        rowItemId: row.itemId,
        keyId: key.keyId,
        keyName: key.keyName,
        kind: key.kind,
      };
      if (key.kind === "primary") {
        const blockIds = row.directBlockIdsByKey.get(key.keyId) ?? [];
        if (blockIds.length > 0) {
          rowTargets.push({ rowItemId: row.itemId, rowTitle: row.title, ...context, blockIds });
        }
        continue;
      }
      const itemIds = row.targetItemIdsByKey.get(key.keyId) ?? [];
      const blockIds = itemIds
        .map((itemId) => blockByTargetItemId.get(itemId))
        .filter((blockId): blockId is string => Boolean(blockId));
      if (blockIds.length > 0) {
        rowTargets.push({ rowItemId: row.itemId, rowTitle: row.title, ...context, blockIds });
      }
      for (const itemId of itemIds) {
        if (!blockByTargetItemId.has(itemId)) {
          unresolved.push({ blockId: itemId, reason: "unbound-row", rowItemId: row.itemId, keyId: key.keyId });
        }
      }
    }
    if (row.unboundPrimaryKey) {
      unresolved.push({
        blockId: row.itemId,
        reason: "unbound-row",
        rowItemId: row.itemId,
        keyId: pointRows.primaryKeyId,
      });
    }
  }

  const documentTargetIds = new Set<string>();
  const unknownBlockIds: string[] = [];
  const distinctBlockIds = new Set(rowTargets.flatMap((row) => row.blockIds));
  for (const blockId of distinctBlockIds) {
    if (catalogByBlockId.has(blockId)) continue;
    if (entriesByDocumentId.has(blockId)) {
      documentTargetIds.add(blockId);
      continue;
    }
    unknownBlockIds.push(blockId);
  }
  const rootDocumentByBlockId = new Map<string, string>();
  if (unknownBlockIds.length > 0) {
    for (const row of await lookupBlockRoots(deps.client, unknownBlockIds)) {
      if (!row.id) continue;
      if (row.type === "d") {
        documentTargetIds.add(row.id);
        continue;
      }
      if (row.root_id) rootDocumentByBlockId.set(row.id, row.root_id);
    }
  }

  // Independent kernel round trips run in parallel to keep the preview fast.
  const bundleDocumentIds = [...new Set(rootDocumentByBlockId.values())]
    .filter((documentId) => entriesByDocumentId.has(documentId));
  const bundles = await Promise.all(bundleDocumentIds.map((documentId) => deps.loadDocumentBundle(documentId)));
  const bundlesByDocumentId = new Map(
    bundleDocumentIds.map((documentId, index) => [documentId, bundles[index]]),
  );

  const treeIdsByDocumentId = new Map<string, string[]>();
  if (playlist.include_subdocuments && documentTargetIds.size > 0) {
    const treeDocumentIds = [...documentTargetIds];
    const trees = await Promise.all(
      treeDocumentIds.map((documentId) => deps.listDocumentTreeIds(documentId).catch(() => [documentId])),
    );
    treeDocumentIds.forEach((documentId, index) => treeIdsByDocumentId.set(documentId, trees[index]));
  }

  const convergence = convergePlaylistTargets({
    rowTargets,
    catalogByBlockId,
    entriesByDocumentId,
    documentTargetIds,
    rootDocumentByBlockId,
    bundlesByDocumentId,
    treeIdsByDocumentId,
  });
  unresolved.push(...convergence.unresolved);

  const questionIds = convergence.unionQuestionIds;
  const hydrated = options.hydrate === false || questionIds.length === 0
    ? { questions: [] as Question[], blockIdsByQuestionId: new Map<string, string>() }
    : await deps.hydrateQuestionSources(questionIds);

  const hits = (blockId: string): PlaylistBlockHit => ({
    blockId,
    questionCount: convergence.hitsByBlockId.get(blockId)?.length ?? 0,
    questionIds: [...(convergence.hitsByBlockId.get(blockId) ?? [])],
  });
  const rows: PlaylistRowReport[] = pointRows.rows.map((row) => {
    const columns: PlaylistColumnReport[] = pointRows.keys.map((key) => {
      const blocks: PlaylistBlockHit[] = [];
      let unboundCount = 0;
      if (key.kind === "primary") {
        for (const blockId of row.directBlockIdsByKey.get(key.keyId) ?? []) blocks.push(hits(blockId));
        if (row.unboundPrimaryKey) {
          blocks.push({ blockId: row.itemId, questionCount: 0, questionIds: [], unbound: "unbound-row" });
        }
      } else {
        for (const itemId of row.targetItemIdsByKey.get(key.keyId) ?? []) {
          const blockId = blockByTargetItemId.get(itemId);
          if (!blockId) {
            unboundCount += 1;
            continue;
          }
          blocks.push(hits(blockId));
        }
      }
      return { keyId: key.keyId, keyName: key.keyName, kind: key.kind, blocks, unboundCount };
    });
    const totalQuestions = new Set(
      columns.flatMap((column) => column.blocks.flatMap((block) => block.questionIds)),
    ).size;
    return { rowItemId: row.itemId, title: row.title, totalQuestions, columns };
  });

  return {
    playlistId: playlist.playlist_id,
    questionIds: [...questionIds],
    questions: hydrated.questions,
    blockIdsByQuestionId: hydrated.blockIdsByQuestionId,
    rows,
    unresolved,
  };
}

export async function loadAttributeViewMeta(
  client: SiyuanKernelClient,
  avId: string,
): Promise<PlaylistAttributeViewMeta> {
  const av = await getAttributeView(client, avId);
  const primaryKeyId = av.keyValues.find((entry) => entry.key.type === "block")?.key.id;
  return {
    avId: av.id,
    name: av.name ?? "",
    keys: av.keyValues.map((entry) => ({
      id: entry.key.id,
      name: entry.key.name,
      type: entry.key.type,
      relationAvId: entry.key.relation?.avID,
      isPrimary: entry.key.id === primaryKeyId,
    })),
    views: (av.views ?? []).map((view) => ({ id: view.id, name: view.name ?? "", type: view.type ?? "" })),
  };
}

const AVS_ATTR_PATTERN = /custom-avs="([^"]*)"/u;

/** Reads the `custom-avs` ids off a block, i.e. the databases bound to it. */
async function readBlockAvIds(client: SiyuanKernelClient, blockId: string): Promise<string[]> {
  if (!NODE_ID_PATTERN.test(blockId)) return [];
  const rows = await client.request<Array<{ id?: string; ial?: string }>>("/api/query/sql", {
    stmt: `SELECT id, ial FROM blocks WHERE id IN ('${blockId}')`,
  });
  const ial = rows?.[0]?.ial ?? "";
  const match = AVS_ATTR_PATTERN.exec(ial);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((id) => id.trim())
    .filter((id) => NODE_ID_PATTERN.test(id));
}

async function readBlockPath(client: SiyuanKernelClient, blockId: string): Promise<string> {
  if (!NODE_ID_PATTERN.test(blockId)) return "";
  try {
    const response = await client.request<{ path?: string }>("/api/filetree/getHPathByID", { id: blockId });
    return response?.path ?? "";
  } catch {
    return "";
  }
}

/**
 * Resolves a pasted id into a database reference. Both flavours are accepted:
 * the id of the block hosting the database (`custom-avs` is read off the block)
 * and the database id itself. Returns `undefined` for anything else.
 */
export async function resolveAttributeViewRef(
  client: SiyuanKernelClient,
  input: string,
): Promise<PlaylistAttributeViewResult | undefined> {
  const trimmed = input.trim();
  if (!NODE_ID_PATTERN.test(trimmed)) return undefined;
  for (const avId of await readBlockAvIds(client, trimmed)) {
    try {
      const av = await getAttributeView(client, avId);
      return {
        avId: av.id,
        avName: av.name ?? "",
        blockId: trimmed,
        hPath: await readBlockPath(client, trimmed),
      };
    } catch {
      continue;
    }
  }
  try {
    const av = await getAttributeView(client, trimmed);
    return { avId: av.id, avName: av.name ?? "", blockId: "", hPath: "" };
  } catch {
    return undefined;
  }
}

export async function searchAttributeViews(
  client: SiyuanKernelClient,
  keyword: string,
): Promise<PlaylistAttributeViewResult[]> {
  const response = await client.request<{
    results?: Array<{ avID?: string; avName?: string; blockID?: string; hPath?: string }>;
  }>("/api/av/searchAttributeView", { keyword });
  return (response.results ?? []).flatMap((result) => result.avID
    ? [{
      avId: result.avID,
      avName: result.avName ?? "",
      blockId: result.blockID ?? "",
      hPath: result.hPath ?? "",
    }]
    : []);
}
