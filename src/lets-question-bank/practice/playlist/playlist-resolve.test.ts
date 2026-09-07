import { describe, expect, it } from "vitest";
import { MockKernelClient } from "@/question-bank/adapters/siyuan/siyuan-adapter.fixtures";
import type { RawAttributeView } from "@/question-bank/adapters/siyuan/types";
import type { QuestionCatalogEntry } from "@/question-bank/assembly";
import type { Question } from "@/question-bank/core/types";
import type { PlaylistResolveDeps } from "./playlist-resolve";
import {
  convergePlaylistTargets,
  loadAttributeViewMeta,
  resolvePlaylistQuestions,
  searchAttributeViews,
} from "./playlist-resolve";
import type { PracticePlaylist } from "./playlist-schema";

const POINT_AV = "20260820225815-7ng4uj8";
const TARGET_AV = "20260901000000-targe01";
const REL_KEY = "20260820230000-relatio1";
const VIEW_ID = "20260901000008-view0001";

const ROW1 = "20260901000001-row0001";
const ROW2 = "20260901000001-row0002";
const ROW3 = "20260901000001-row0003";

const Q1_BLOCK = "20260901000002-quest01";
const Q2_BLOCK = "20260901000002-quest02";
const Q3_BLOCK = "20260901000002-quest03";
const Q4_BLOCK = "20260901000002-quest04";
const Q5_BLOCK = "20260901000002-quest05";
const HEADING = "20260901000002-head001";
const DOC = "20260901000003-doc0001";
const CHILD_DOC = "20260901000003-doc0002";
const NOT_INDEXED_DOC = "20260901000003-doc0003";
const UNKNOWN_BLOCK = "20260901000004-blok001";

const ITEM_Q1 = "20260901000005-item001";
const ITEM_HEADING = "20260901000005-item002";
const ITEM_NOT_INDEXED = "20260901000005-item003";
const ITEM_UNKNOWN = "20260901000005-item004";
const ITEM_UNBOUND = "20260901000005-item005";

const T1 = "20260901000006-topi001";
const T2 = "20260901000006-topi002";

const Q1 = "q1";
const Q2 = "q2";
const Q3 = "q3";
const Q4 = "q4";
const Q5 = "q5";

const POINT_PRIMARY = "point-primary";
const TARGET_PRIMARY = "target-primary";

function pointAv(): RawAttributeView {
  return {
    id: POINT_AV,
    name: "Point LPQE",
    keyValues: [
      {
        key: { id: POINT_PRIMARY, name: "Title", type: "block" },
        values: [
          { keyID: POINT_PRIMARY, blockID: ROW1, type: "block", block: { content: "Point One" } },
          { keyID: POINT_PRIMARY, blockID: ROW2, type: "block", block: { content: "Point Two" } },
          { keyID: POINT_PRIMARY, blockID: ROW3, type: "block", block: { content: "Point Three" } },
        ],
      },
      {
        key: {
          id: REL_KEY,
          name: "Questions",
          type: "relation",
          relation: { avID: TARGET_AV, backKeyID: "back-key", isTwoWay: true },
        },
        values: [
          {
            keyID: REL_KEY,
            blockID: ROW1,
            type: "relation",
            relation: { blockIDs: [ITEM_Q1, ITEM_HEADING, ITEM_NOT_INDEXED, ITEM_UNKNOWN, ITEM_UNBOUND] },
          },
          { keyID: REL_KEY, blockID: ROW2, type: "relation", relation: { blockIDs: [ITEM_Q1] } },
        ],
      },
    ],
    views: [{ id: VIEW_ID, name: "Todo view", type: "table" }],
  };
}

function targetAv(): RawAttributeView {
  return {
    id: TARGET_AV,
    name: "Question targets",
    keyValues: [
      {
        key: { id: TARGET_PRIMARY, name: "Title", type: "block" },
        values: [
          { keyID: TARGET_PRIMARY, blockID: ITEM_Q1, type: "block", block: { id: Q1_BLOCK, content: "q1" } },
          { keyID: TARGET_PRIMARY, blockID: ITEM_HEADING, type: "block", block: { id: HEADING, content: "Heading" } },
          { keyID: TARGET_PRIMARY, blockID: ITEM_NOT_INDEXED, type: "block", block: { id: NOT_INDEXED_DOC, content: "Unindexed" } },
          { keyID: TARGET_PRIMARY, blockID: ITEM_UNKNOWN, type: "block", block: { id: UNKNOWN_BLOCK, content: "Unknown" } },
          { keyID: TARGET_PRIMARY, blockID: ITEM_UNBOUND, type: "block", block: { content: "Unbound" } },
        ],
      },
    ],
  };
}

function catalogEntry(questionId: string, blockId: string, documentId: string): QuestionCatalogEntry {
  return { questionId, blockId, documentId } as QuestionCatalogEntry;
}

const catalog: QuestionCatalogEntry[] = [
  catalogEntry(Q1, Q1_BLOCK, DOC),
  catalogEntry(Q2, Q2_BLOCK, DOC),
  catalogEntry(Q3, Q3_BLOCK, DOC),
  catalogEntry(Q4, Q4_BLOCK, DOC),
  catalogEntry(Q5, Q5_BLOCK, CHILD_DOC),
];

function bundleQuestion(id: string, scopeTopicId?: string): Question {
  return {
    id,
    type: "single",
    title: id,
    stemMarkdown: "",
    options: [],
    solutionMarkdown: "",
    metadata: { ...(scopeTopicId ? { scopeTopicId } : {}), topicPath: [] },
  } as Question;
}

const bundle = {
  documentId: DOC,
  questions: [
    bundleQuestion(Q1, T2),
    bundleQuestion(Q2, T1),
    bundleQuestion(Q3, T1),
    bundleQuestion(Q4, T2),
  ],
  topics: [
    { id: T1, title: "Topic One", level: 1, childIds: [], explicit: true },
    { id: T2, title: "Topic Two", level: 1, childIds: [], explicit: true },
  ],
  topicIdByBlockId: new Map([[HEADING, T1]]),
};

function playlistFixture(overrides: Partial<PracticePlaylist> = {}): PracticePlaylist {
  return {
    schema_version: 1,
    playlist_id: "20260907000000-play001",
    revision: 1,
    name: "Playlist",
    point_av_id: POINT_AV,
    relation_key_ids: [REL_KEY],
    include_subdocuments: true,
    created_at: "2026-09-07T00:00:00.000Z",
    updated_at: "2026-09-07T00:00:00.000Z",
    ...overrides,
  };
}

function makeDeps(client: MockKernelClient): PlaylistResolveDeps {
  return {
    client,
    loadCatalog: async () => catalog,
    loadDocumentBundle: async (documentId: string) => (documentId === DOC ? bundle : undefined),
    listDocumentTreeIds: async (documentId: string) => (documentId === NOT_INDEXED_DOC
      ? [NOT_INDEXED_DOC, CHILD_DOC]
      : [documentId]),
    hydrateQuestionSources: async (questionIds: readonly string[]) => ({
      questions: questionIds.map((id) => bundleQuestion(id)),
      blockIdsByQuestionId: new Map(questionIds.map((id) => [id, `blk-${id}`])),
    }),
  };
}

describe("playlist resolve", () => {
  it("resolves direct questions, heading subtrees, subdocuments, and reports unresolved targets", async () => {
    const client = new MockKernelClient();
    client.attributeViews.set(POINT_AV, pointAv());
    client.attributeViews.set(TARGET_AV, targetAv());
    client.blockRoots.set(HEADING, DOC);
    client.blockRoots.set(NOT_INDEXED_DOC, NOT_INDEXED_DOC);
    client.blockTypes.set(NOT_INDEXED_DOC, "d");

    const resolution = await resolvePlaylistQuestions(makeDeps(client), playlistFixture());

    expect(resolution.questionIds).toEqual([Q1, Q2, Q3, Q5]);
    expect(resolution.questions.map((question) => question.id)).toEqual([Q1, Q2, Q3, Q5]);
    expect(resolution.blockIdsByQuestionId.get(Q1)).toBe(`blk-${Q1}`);

    const rows = Object.fromEntries(resolution.rows.map((row) => [row.title, row.questionCount]));
    expect(rows).toEqual({ "Point One": 4, "Point Two": 1, "Point Three": 0 });

    expect(resolution.unresolved).toEqual([
      { blockId: ITEM_UNBOUND, reason: "unbound-row" },
      { blockId: NOT_INDEXED_DOC, reason: "not-indexed" },
      { blockId: UNKNOWN_BLOCK, reason: "unsupported-block" },
    ]);
  });

  it("keeps only the rows selected by the configured view", async () => {
    const client = new MockKernelClient();
    client.attributeViews.set(POINT_AV, pointAv());
    client.attributeViews.set(TARGET_AV, targetAv());
    client.blockRoots.set(HEADING, DOC);
    client.blockRoots.set(NOT_INDEXED_DOC, NOT_INDEXED_DOC);
    client.blockTypes.set(NOT_INDEXED_DOC, "d");
    client.renderViews.set(`${POINT_AV}/${VIEW_ID}`, { rows: [{ id: ROW1 }, { id: ROW3 }], rowCount: 2 });

    const resolution = await resolvePlaylistQuestions(
      makeDeps(client),
      playlistFixture({ view_id: VIEW_ID }),
    );

    expect(resolution.rows.map((row) => row.title)).toEqual(["Point One", "Point Three"]);
    expect(resolution.questionIds).toEqual([Q1, Q2, Q3, Q5]);
  });

  it("ignores relation columns that are not listed in the playlist", async () => {
    const client = new MockKernelClient();
    const av = pointAv();
    av.keyValues[1].values = av.keyValues[1].values.filter((value) => value.blockID === ROW2);
    client.attributeViews.set(POINT_AV, av);
    client.attributeViews.set(TARGET_AV, targetAv());
    client.blockRoots.set(HEADING, DOC);

    const resolution = await resolvePlaylistQuestions(
      makeDeps(client),
      playlistFixture({ relation_key_ids: [] }),
    );

    expect(resolution.questionIds).toEqual([]);
    expect(resolution.rows.map((row) => row.questionCount)).toEqual([0, 0, 0]);
  });

  it("dedupes repeated question ids inside convergePlaylistTargets", () => {
    const result = convergePlaylistTargets({
      rowTargets: [
        { rowItemId: "r1", rowTitle: "A", blockIds: [Q1_BLOCK, Q2_BLOCK] },
        { rowItemId: "r2", rowTitle: "B", blockIds: [Q1_BLOCK] },
      ],
      catalogByBlockId: new Map([
        [Q1_BLOCK, catalogEntry(Q1, Q1_BLOCK, DOC)],
        [Q2_BLOCK, catalogEntry(Q2, Q2_BLOCK, DOC)],
      ]),
      entriesByDocumentId: new Map(),
      documentTargetIds: new Set(),
      rootDocumentByBlockId: new Map(),
      bundlesByDocumentId: new Map(),
      treeIdsByDocumentId: new Map(),
    });

    expect(result.unionQuestionIds).toEqual([Q1, Q2]);
    expect(result.unresolved).toEqual([]);
  });

  it("exposes database metadata and search results for the manager", async () => {
    const client = new MockKernelClient();
    client.attributeViews.set(POINT_AV, pointAv());
    client.avSearchResults.push(
      { avID: POINT_AV, avName: "Point LPQE", blockID: "20260901000007-blok001", hPath: "/Notes/Point" },
      { avID: TARGET_AV, avName: "Targets", blockID: "20260901000007-blok002", hPath: "/Notes/Targets" },
    );

    const meta = await loadAttributeViewMeta(client, POINT_AV);
    expect(meta.name).toBe("Point LPQE");
    expect(meta.keys.find((key) => key.id === REL_KEY)?.relationAvId).toBe(TARGET_AV);
    expect(meta.views).toEqual([{ id: VIEW_ID, name: "Todo view", type: "table" }]);

    expect((await searchAttributeViews(client, "LPQE")).map((result) => result.avId)).toEqual([POINT_AV]);
    expect(await searchAttributeViews(client, "zzz")).toEqual([]);
    expect((await searchAttributeViews(client, "")).length).toBe(2);
  });
});
