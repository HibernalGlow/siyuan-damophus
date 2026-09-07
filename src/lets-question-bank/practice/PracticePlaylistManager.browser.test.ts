import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, tick, unmount } from "svelte";import { en } from "@/translations/parts/lets-question-bank";
import type { PlaylistAttributeViewMeta, PlaylistResolution } from "./playlist/playlist-resolve";
import type { PracticePlaylist } from "./playlist/playlist-schema";
import PracticePlaylistManager from "./PracticePlaylistManager.svelte";

let mounted: ReturnType<typeof mount> | undefined;

function translation(source: Record<string, string>) {
  return (key: string, fallback: string) => source[`lets-question-bank.${key}`] ?? fallback;
}

const meta: PlaylistAttributeViewMeta = {
  avId: "20260820225815-7ng4uj8",
  name: "Point LPQE",
  keys: [
    { id: "20260901000010-key0001", name: "Title", type: "block", isPrimary: true },
    { id: "20260901000010-key0002", name: "Questions", type: "relation", relationAvId: "20260901000000-targe01" },
    { id: "20260901000010-key0003", name: "Notes", type: "text" },
  ],
  views: [{ id: "view-1", name: "All rows", type: "table" }],
};

const searchResults = [{
  avId: "20260820225815-7ng4uj8",
  avName: "Point LPQE",
  blockId: "20260901000000-blok001",
  hPath: "/Notes/Point LPQE",
}];

const resolution: PlaylistResolution = {
  playlistId: "20260907000000-play001",
  questionIds: ["q-1", "q-2"],
  questions: [],
  blockIdsByQuestionId: new Map(),
  rows: [
    {
      rowItemId: "row-1",
      title: "Point One",
      totalQuestions: 2,
      columns: [
        {
          keyId: "20260901000010-key0002",
          keyName: "Questions",
          kind: "relation",
          blocks: [
            { blockId: "20260901000002-quest01", questionCount: 2, questionIds: ["q-1", "q-2"] },
          ],
          unboundCount: 0,
        },
      ],
    },
  ],
  unresolved: [
    { blockId: "20260901000003-doc001", reason: "not-indexed", rowItemId: "row-1", keyId: "20260901000010-key0002" },
  ],
};

async function renderManager(options: {
  open?: boolean;
  playlists?: PracticePlaylist[];
  controller?: Record<string, unknown>;
  onSave?: (playlist: PracticePlaylist) => Promise<void>;
  onDelete?: (playlistId: string) => Promise<void>;
} = {}) {
  const controller = {
    loadPlaylistAttributeViewMeta: vi.fn(async () => meta),
    searchPlaylistAttributeViews: vi.fn(async () => searchResults),
    previewPlaylist: vi.fn(async () => resolution),
    resolvePlaylist: vi.fn(async () => resolution),
    ...options.controller,
  };
  const onSave = options.onSave ?? vi.fn(async () => undefined);
  const onDelete = options.onDelete ?? vi.fn(async () => undefined);
  const target = document.createElement("div");
  document.body.appendChild(target);
  mounted = mount(PracticePlaylistManager, {
    target,
    props: {
      open: options.open ?? true,
      label: translation(en),
      playlists: options.playlists ?? [],
      controller,
      onSave,
      onDelete,
      onClose: vi.fn(),
    },
  });
  await tick();
  return { controller, onSave, onDelete };
}

function testid(name: string): HTMLElement | null {
  return document.querySelector(`[data-testid="${name}"]`);
}

/** Relation/bind column chips; plain columns such as text are not offered. */
function sourceChips(): HTMLElement[] {
  return [...document.querySelectorAll("[data-testid='playlist-relation-chip']")] as HTMLElement[];
}

async function fillInput(element: Element, value: string): Promise<void> {
  (element as HTMLInputElement).value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
}

/** Drains the pending microtasks and reactive flushes after an async interaction. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await tick();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(async () => {
  if (mounted) await unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
});

describe("practice playlist manager", () => {
  it("configures a playlist from search to relation keys and saves the parsed draft", async () => {
    const { controller, onSave } = await renderManager();

    expect(testid("playlist-modal")).not.toBeNull();
    expect(testid("playlist-save")?.hasAttribute("disabled")).toBe(true);

    await fillInput(document.querySelector(".playlist-db-search input")!, "LPQE");
    testid("playlist-db-search")!.click();
    await flush();

    const result = testid("playlist-db-result");
    expect(result).not.toBeNull();
    result!.click();
    await flush();

    expect(testid("playlist-selected-db")?.textContent).toContain("Point LPQE");
    // The name defaults to the database name until the user types one.
    expect((document.querySelector("#playlist-name-input") as HTMLInputElement).value).toBe("Point LPQE");
    // The primary bind column and the relation column are both offered, text columns are not.
    expect(sourceChips()).toHaveLength(2);
    expect(sourceChips()[0].textContent).toContain("Title");
    expect(sourceChips()[0].textContent).toContain("primary/bind");
    expect(sourceChips()[1].textContent).toContain("Questions");
    expect(sourceChips()[1].textContent).toContain("relation");

    sourceChips()[1].click();
    await flush();
    await fillInput(document.querySelector("#playlist-name-input")!, "Civil points");

    expect(testid("playlist-save")?.hasAttribute("disabled")).toBe(false);

    testid("playlist-preview")!.click();
    await flush();
    // Preview uses the hydration-free path; the practice session resolves fully.
    expect(controller.previewPlaylist).toHaveBeenCalled();
    expect(controller.resolvePlaylist).not.toHaveBeenCalled();
    expect(testid("playlist-preview-total")?.textContent).toContain("2");

    // Expanding a row reveals the row -> column -> block -> questions trace.
    const row = testid("playlist-preview-row") as HTMLDetailsElement | null;
    expect(row).not.toBeNull();
    row!.open = true;
    await flush();
    const column = testid("playlist-preview-column");
    expect(column?.textContent).toContain("Questions");
    expect(column?.textContent).toContain("relation");
    const block = testid("playlist-preview-block");
    expect(block?.textContent).toContain("20260901000002-quest01");
    expect(block?.textContent).toContain("q-1");
    expect(block?.textContent).toContain("q-2");

    testid("playlist-save")!.click();
    await flush();

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(onSave).mock.calls[0][0];
    expect(saved.name).toBe("Civil points");
    expect(saved.point_av_id).toBe("20260820225815-7ng4uj8");
    expect(saved.relation_key_ids).toEqual(["20260901000010-key0002"]);
    expect(saved.view_id).toBeUndefined();
    expect(saved.revision).toBe(1);
  });

  it("reports unresolved targets and deletes the playlist after confirming", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDelete = vi.fn(async () => undefined);
    const { controller } = await renderManager({ onDelete });

    await fillInput(document.querySelector(".playlist-db-search input")!, "LPQE");
    testid("playlist-db-search")!.click();
    await flush();
    testid("playlist-db-result")!.click();
    await flush();
    sourceChips()[1].click();
    await flush();
    await fillInput(document.querySelector("#playlist-name-input")!, "Civil points");

    testid("playlist-preview")!.click();
    await flush();

    const unresolved = testid("playlist-preview-unresolved");
    expect(unresolved).not.toBeNull();
    expect(unresolved?.textContent).toContain("1");
    expect(unresolved?.textContent).toContain("20260901000003-doc001");
    expect(unresolved?.textContent).toContain("Point One");
    expect(unresolved?.textContent).toContain("Questions");
    expect(unresolved?.textContent).toContain("not indexed in the question bank");
    expect(controller.previewPlaylist).toHaveBeenCalled();

    testid("playlist-save")!.click();
    await flush();

    expect(testid("playlist-delete")).not.toBeNull();
    testid("playlist-delete")!.click();
    await flush();

    expect(confirmSpy).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("accepts a pasted database block id without running the keyword search", async () => {
    const resolvePlaylistDatabaseRef = vi.fn(async (input: string) => (input === "20260901000009-dbblk01"
      ? { avId: meta.avId, avName: "Pasted DB", blockId: input, hPath: "/Notes/Pasted" }
      : undefined));
    const { controller } = await renderManager({ controller: { resolvePlaylistDatabaseRef } });

    await fillInput(document.querySelector(".playlist-db-search input")!, "20260901000009-dbblk01");
    testid("playlist-db-search")!.click();
    await flush();

    expect(resolvePlaylistDatabaseRef).toHaveBeenCalledWith("20260901000009-dbblk01");
    expect(controller.searchPlaylistAttributeViews).not.toHaveBeenCalled();
    expect(testid("playlist-selected-db")?.textContent).toContain("Point LPQE");
    expect(testid("playlist-db-results")).toBeNull();
  });

  it("stays closed until opened", async () => {
    await renderManager({ open: false });
    expect(testid("playlist-modal")).toBeNull();
  });
});
