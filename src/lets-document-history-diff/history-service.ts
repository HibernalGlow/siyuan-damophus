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

export function normalizeHistoryBlockDOM(content: string): string {
  if (typeof DOMParser === "undefined") return content;
  const document = new DOMParser().parseFromString(content, "text/html");
  const readonlyContainers = document.body.querySelectorAll<HTMLElement>(
    '[data-type^="Node"] > [contenteditable="false"][spellcheck="false"]',
  );
  for (const container of readonlyContainers) container.replaceWith(...container.childNodes);
  return document.body.innerHTML;
}

export class DocumentHistoryService {
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
