import { getAllTabs } from "siyuan";
import { getHPathByID } from "@/api";

export interface TabIconOptions {
  parentPath: string;
  icon: string;
}

export interface TabWithDocument {
  docIcon?: string;
  setDocIcon?: (icon: string) => void;
  model?: unknown;
  headElement?: HTMLElement;
}

export function normalizeHPath(value: string): string {
  const normalized = value.trim().replace(/\\/gu, "/").replace(/\/{2,}/gu, "/");
  if (!normalized) return "";
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/u, "") : withLeadingSlash;
}

export function isDescendantHPath(parentPath: string, candidatePath: string): boolean {
  const parent = normalizeHPath(parentPath);
  const candidate = normalizeHPath(candidatePath);
  return Boolean(parent && candidate && candidate.startsWith(`${parent}/`));
}

export function getTabRootId(tab: TabWithDocument): string | undefined {
  const model = tab.model as { editor?: { protyle?: { block?: { rootID?: string } } } } | undefined;
  const rootId = model?.editor?.protyle?.block?.rootID;
  if (rootId) return rootId;
  const initData = tab.headElement?.getAttribute("data-initdata");
  if (!initData) return undefined;
  try {
    const parsed = JSON.parse(initData) as { rootId?: string; rootID?: string };
    return parsed.rootId || parsed.rootID;
  } catch {
    return undefined;
  }
}

type TabGetter = () => readonly TabWithDocument[];
type PathResolver = (id: string) => Promise<string>;

export class TabIconController {
  private options: TabIconOptions = { parentPath: "", icon: "" };
  private readonly managed = new Map<TabWithDocument, string>();
  private observer?: MutationObserver;
  private timer?: number;
  private syncing = false;
  private syncQueued = false;

  constructor(
    private readonly getTabs: TabGetter = () => getAllTabs(),
    private readonly resolvePath: PathResolver = getHPathByID,
  ) {}

  start(options: TabIconOptions): void {
    this.options = options;
    if (typeof document === "undefined") return;
    if (!document.body) return;
    this.observer ??= new MutationObserver(() => void this.sync());
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.timer ??= window.setInterval(() => void this.sync(), 1200);
    void this.sync();
  }

  updateOptions(options: TabIconOptions): void {
    this.options = options;
    void this.sync();
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
    this.restoreManagedTabs();
  }

  async sync(): Promise<void> {
    if (this.syncing) {
      this.syncQueued = true;
      return;
    }
    this.syncing = true;
    try {
      const options = {
        parentPath: normalizeHPath(this.options.parentPath),
        icon: this.options.icon.trim(),
      };
      const tabs = this.getTabs();
      const matches = new Set<TabWithDocument>();
      if (options.parentPath && options.icon) {
        await Promise.all(tabs.map(async (tab) => {
          const rootId = getTabRootId(tab);
          if (!rootId) return;
          try {
            if (isDescendantHPath(options.parentPath, await this.resolvePath(rootId))) matches.add(tab);
          } catch {
            // A tab can disappear while its document path is being resolved.
          }
        }));
      }

      for (const tab of tabs) {
        if (matches.has(tab)) this.applyIcon(tab, options.icon);
        else this.restoreIcon(tab);
      }
      for (const tab of this.managed.keys()) {
        if (!tabs.includes(tab)) this.restoreIcon(tab);
      }
    } finally {
      this.syncing = false;
      if (this.syncQueued) {
        this.syncQueued = false;
        void this.sync();
      }
    }
  }

  private applyIcon(tab: TabWithDocument, icon: string): void {
    if (typeof tab.setDocIcon !== "function") return;
    // User-defined document icons always take precedence over this helper.
    if (!this.managed.has(tab) && tab.docIcon) return;
    if (!this.managed.has(tab)) this.managed.set(tab, tab.docIcon || "");
    if (tab.docIcon !== icon) tab.setDocIcon(icon);
    if (tab.headElement?.dataset.damophusTabIcon !== icon) {
      tab.headElement?.setAttribute("data-damophus-tab-icon", icon);
    }
  }

  private restoreIcon(tab: TabWithDocument): void {
    const original = this.managed.get(tab);
    if (original === undefined || typeof tab.setDocIcon !== "function") return;
    if (tab.docIcon !== original) tab.setDocIcon(original);
    if (tab.headElement?.dataset.damophusTabIcon) {
      tab.headElement.removeAttribute("data-damophus-tab-icon");
    }
    this.managed.delete(tab);
  }

  private restoreManagedTabs(): void {
    for (const tab of [...this.managed.keys()]) this.restoreIcon(tab);
  }
}
