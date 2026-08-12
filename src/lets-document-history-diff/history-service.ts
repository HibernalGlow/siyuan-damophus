import {
  getBlockKramdownStrict,
  getDocHistoryContent,
  getDocHistoryItems,
  searchDocHistory,
} from "@/api";
import type { HistoryVersion } from "./types";

interface LuteConverter {
  BlockDOM2StdMd(html: string): string;
}

export interface HistoryPage {
  versions: HistoryVersion[];
  page: number;
  pageCount: number;
  totalCount: number;
}

export interface HistoryDiffService {
  loadPage(page?: number): Promise<HistoryPage>;
  loadCurrentKramdown(): Promise<string>;
  invalidateCurrent(): void;
  loadVersionKramdown(version: HistoryVersion): Promise<string>;
  resolveVersion(version: HistoryVersion): Promise<HistoryVersion>;
}

export function normalizeHistoryBlockDOM(content: string): string {
  if (typeof DOMParser === "undefined") return content;
  const document = new DOMParser().parseFromString(content, "text/html");
  const readonlyContainers = document.body.querySelectorAll<HTMLElement>(
    '[data-type^="Node"] > [contenteditable="false"][spellcheck="false"]',
  );
  for (const container of readonlyContainers) container.replaceWith(...container.childNodes);
  return document.body.innerHTML;
}

export class DocumentHistoryService implements HistoryDiffService {
  private readonly versionCache = new Map<string, Promise<string>>();
  private readonly itemCache = new Map<string, Promise<HistoryVersion>>();
  private currentCache?: Promise<string>;

  constructor(
    private readonly documentId: string,
    private readonly lute: LuteConverter,
  ) {}

  async loadPage(page = 1): Promise<HistoryPage> {
    const result = await searchDocHistory(this.documentId, page);
    return {
      versions: result.histories.map((created) => ({ created })),
      page,
      pageCount: result.pageCount,
      totalCount: result.totalCount,
    };
  }

  async loadCurrentKramdown(): Promise<string> {
    this.currentCache ??= getBlockKramdownStrict(this.documentId).then((result) => result.kramdown ?? "");
    return this.currentCache;
  }

  invalidateCurrent(): void {
    this.currentCache = undefined;
  }

  async loadVersionKramdown(version: HistoryVersion): Promise<string> {
    const resolved = await this.resolveVersion(version);
    const path = resolved.path!;
    const cached = this.versionCache.get(path);
    if (cached) return cached;
    const loading = getDocHistoryContent(path).then((result) => (
      result.isLargeDoc
        ? result.content
        : this.lute.BlockDOM2StdMd(normalizeHistoryBlockDOM(result.content))
    ));
    this.versionCache.set(path, loading);
    return loading;
  }

  async resolveVersion(version: HistoryVersion): Promise<HistoryVersion> {
    if (version.path) return version;
    const cached = this.itemCache.get(version.created);
    if (cached) return cached;
    const loading = getDocHistoryItems(this.documentId, version.created).then((items) => {
      const item = items[0];
      if (!item) throw new Error(`History item not found: ${version.created}`);
      return {
        created: version.created,
        title: item.title,
        path: item.path,
        operation: item.op,
      };
    });
    this.itemCache.set(version.created, loading);
    return loading;
  }
}

interface BlockSnapshot {
  version: HistoryVersion;
  kramdown: string;
}

interface BlockHistoryApi {
  searchDocHistory: typeof searchDocHistory;
  getDocHistoryItems: typeof getDocHistoryItems;
  getDocHistoryContent: typeof getDocHistoryContent;
  getBlockKramdownStrict: typeof getBlockKramdownStrict;
}

const defaultBlockHistoryApi: BlockHistoryApi = {
  searchDocHistory,
  getDocHistoryItems,
  getDocHistoryContent,
  getBlockKramdownStrict,
};

export class BlockHistoryService implements HistoryDiffService {
  private readonly pageCache = new Map<number, Promise<HistoryPage>>();
  private readonly snapshotCache = new Map<string, Promise<BlockSnapshot | undefined>>();
  private readonly versionCache = new Map<string, string>();
  private readonly seenRevisions = new Set<string>();
  private reachedCreationBoundary = false;
  private discoveredVersionCount = 0;
  private currentCache?: Promise<string>;

  constructor(
    private readonly documentId: string,
    private readonly blockId: string,
    private readonly lute: LuteConverter,
    private readonly api: BlockHistoryApi = defaultBlockHistoryApi,
  ) {}

  loadCurrentKramdown(): Promise<string> {
    this.currentCache ??= this.api.getBlockKramdownStrict(this.blockId).then((result) => result.kramdown ?? "");
    return this.currentCache;
  }

  invalidateCurrent(): void {
    this.currentCache = undefined;
  }

  loadPage(page = 1): Promise<HistoryPage> {
    const cached = this.pageCache.get(page);
    if (cached) return cached;
    const loading = this.buildPage(page);
    this.pageCache.set(page, loading);
    return loading;
  }

  private async buildPage(page: number): Promise<HistoryPage> {
    const result = await this.api.searchDocHistory(this.documentId, page);
    const versions: HistoryVersion[] = [];
    if (!this.reachedCreationBoundary) for (const created of result.histories) {
      const snapshot = await this.loadSnapshot(created);
      if (!snapshot) {
        this.reachedCreationBoundary = true;
        break;
      }
      const revision = snapshot.version.revision ?? snapshot.version.created;
      if (this.seenRevisions.has(revision)) continue;
      this.seenRevisions.add(revision);
      this.discoveredVersionCount += 1;
      this.versionCache.set(snapshot.version.path!, snapshot.kramdown);
      versions.push(snapshot.version);
    }
    return {
      versions,
      page,
      pageCount: this.reachedCreationBoundary ? page : result.pageCount,
      totalCount: this.discoveredVersionCount,
    };
  }

  private loadSnapshot(created: string): Promise<BlockSnapshot | undefined> {
    const cached = this.snapshotCache.get(created);
    if (cached) return cached;
    const loading = this.api.getDocHistoryItems(this.documentId, created).then(async (items) => {
      const item = items[0];
      if (!item) return undefined;
      const result = await this.api.getDocHistoryContent(item.path);
      if (result.isLargeDoc || typeof DOMParser === "undefined") return undefined;
      const document = new DOMParser().parseFromString(result.content, "text/html");
      const block = Array.from(document.body.querySelectorAll<HTMLElement>("[data-node-id]"))
        .find((candidate) => candidate.dataset.nodeId === this.blockId);
      if (!block) return undefined;
      const revision = block.getAttribute("updated") ?? block.dataset.nodeId?.slice(0, 14) ?? created;
      const kramdown = this.lute.BlockDOM2StdMd(normalizeHistoryBlockDOM(block.outerHTML));
      return {
        version: {
          created,
          path: item.path,
          title: item.title,
          operation: item.op,
          revision,
        },
        kramdown,
      };
    });
    this.snapshotCache.set(created, loading);
    return loading;
  }

  async resolveVersion(version: HistoryVersion): Promise<HistoryVersion> {
    if (version.path) return version;
    const snapshot = await this.loadSnapshot(version.created);
    if (!snapshot) throw new Error(`Block history item not found: ${version.created}`);
    return snapshot.version;
  }

  async loadVersionKramdown(version: HistoryVersion): Promise<string> {
    const resolved = await this.resolveVersion(version);
    const cached = this.versionCache.get(resolved.path!);
    if (cached !== undefined) return cached;
    const snapshot = await this.loadSnapshot(resolved.created);
    if (!snapshot) throw new Error(`Block history content not found: ${resolved.created}`);
    this.versionCache.set(resolved.path!, snapshot.kramdown);
    return snapshot.kramdown;
  }
}
