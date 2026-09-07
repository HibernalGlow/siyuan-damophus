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
}

export interface PlaylistRowReport {
  rowItemId: string;
  title: string;
  targetCount: number;
  questionCount: number;
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
  hydrateQuestionSources(questionIds: readonly string[]): Promise<HydratedQuestionSource>;
}

/** Metadata of a user database, used by the playlist manager for configuration. */
export interface PlaylistAttributeViewMeta {
  avId: string;
  name: string;
  keys: Array<{ id: string; name: string; type: string; relationAvId?: string }>;
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

interface PointRowTargets {
  rows: Array<{ itemId: string; title: string; targetItemIds: string[] }>;
  targetAvIds: string[];
}

async function readPointRowTargets(client: SiyuanKernelClient, playlist: PracticePlaylist): Promise<PointRowTargets> {
  const av = await getAttributeView(client, playlist.point_av_id);
  const rowIdSet = playlist.view_id
    ? new Set(await renderRowItemIds(client, av.id, playlist.view_id))
    : undefined;
  const primaryKey = av.keyValues.find((entry) => entry.key.type === "block");
  const rows = new Map<string, { itemId: string; title: string; targetItemIds: string[] }>();
  for (const value of primaryKey?.values ?? []) {
    if (rowIdSet && !rowIdSet.has(value.blockID)) continue;
    rows.set(value.blockID, {
      itemId: value.blockID,
      title: value.block?.content ?? value.text?.content ?? "",
      targetItemIds: [],
    });
  }
  const targetAvIds: string[] = [];
  for (const keyId of playlist.relation_key_ids) {
    const entry = av.keyValues.find((item) => item.key.id === keyId);
    if (!entry) continue;
    const relationAvId = entry.key.relation?.avID;
    if (relationAvId && !targetAvIds.includes(relationAvId)) targetAvIds.push(relationAvId);
    for (const value of entry.values) {
      const row = rows.get(value.blockID);
      if (!row) continue;
      for (const targetId of value.relation?.blockIDs ?? []) {
        if (!row.targetItemIds.includes(targetId)) row.targetItemIds.push(targetId);
      }
    }
  }
  return { rows: [...rows.values()], targetAvIds };
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

export interface PlaylistConvergenceInput {
  rowTargets: Array<{ rowItemId: string; rowTitle: string; blockIds: string[] }>;
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
  const addUnresolved = (blockId: string, reason: PlaylistUnresolvedReason): void => {
    const key = `${reason}:${blockId}`;
    if (unresolvedSeen.has(key)) return;
    unresolvedSeen.add(key);
    unresolved.push({ blockId, reason });
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
            addUnresolved(documentId, "not-indexed");
            continue;
          }
          for (const entry of entries) addHit(blockId, entry.questionId);
        }
        continue;
      }
      const rootDocumentId = input.rootDocumentByBlockId.get(blockId);
      if (!rootDocumentId) {
        addUnresolved(blockId, "unsupported-block");
        continue;
      }
      const entries = input.entriesByDocumentId.get(rootDocumentId);
      if (!entries || entries.length === 0) {
        addUnresolved(rootDocumentId, "not-indexed");
        continue;
      }
      const bundle = input.bundlesByDocumentId.get(rootDocumentId);
      if (!bundle) {
        addUnresolved(rootDocumentId, "doc-unavailable");
        continue;
      }
      const topicId = bundle.topicIdByBlockId.get(blockId);
      if (!topicId) {
        addUnresolved(blockId, "unsupported-block");
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
        addUnresolved(blockId, "unsupported-block");
        continue;
      }
      for (const question of matched) addHit(blockId, question.id);
    }
  }
  return { hitsByBlockId, unionQuestionIds, unresolved };
}

export async function resolvePlaylistQuestions(
  deps: PlaylistResolveDeps,
  playlist: PracticePlaylist,
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

  const rowTargets = pointRows.rows.map((row) => ({
    rowItemId: row.itemId,
    rowTitle: row.title,
    blockIds: row.targetItemIds
      .map((itemId) => blockByTargetItemId.get(itemId))
      .filter((blockId): blockId is string => Boolean(blockId)),
  }));
  const unresolved: PlaylistUnresolved[] = [];
  for (const row of pointRows.rows) {
    for (const targetItemId of row.targetItemIds) {
      if (!blockByTargetItemId.has(targetItemId)) unresolved.push({ blockId: targetItemId, reason: "unbound-row" });
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

  const bundlesByDocumentId = new Map<string, DocumentScanBundle | undefined>();
  for (const documentId of new Set(rootDocumentByBlockId.values())) {
    if (!entriesByDocumentId.has(documentId)) continue;
    bundlesByDocumentId.set(documentId, await deps.loadDocumentBundle(documentId));
  }

  const treeIdsByDocumentId = new Map<string, string[]>();
  if (playlist.include_subdocuments) {
    for (const documentId of documentTargetIds) {
      treeIdsByDocumentId.set(documentId, await deps.listDocumentTreeIds(documentId).catch(() => [documentId]));
    }
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
  const hydrated = questionIds.length > 0
    ? await deps.hydrateQuestionSources(questionIds)
    : { questions: [] as Question[], blockIdsByQuestionId: new Map<string, string>() };

  const rows: PlaylistRowReport[] = pointRows.rows.map((row) => ({
    rowItemId: row.itemId,
    title: row.title,
    targetCount: row.targetItemIds.length,
    questionCount: row.targetItemIds.reduce((total, targetItemId) => {
      const blockId = blockByTargetItemId.get(targetItemId);
      return total + (blockId ? convergence.hitsByBlockId.get(blockId)?.length ?? 0 : 0);
    }, 0),
  }));

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
  return {
    avId: av.id,
    name: av.name ?? "",
    keys: av.keyValues.map((entry) => ({
      id: entry.key.id,
      name: entry.key.name,
      type: entry.key.type,
      relationAvId: entry.key.relation?.avID,
    })),
    views: (av.views ?? []).map((view) => ({ id: view.id, name: view.name ?? "", type: view.type ?? "" })),
  };
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
