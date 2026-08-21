import { getHPathByID } from "@/api";
import { sql } from "@/api";
import type { IProtyle } from "siyuan";

export const MOBILE_TITLE_PATH_STYLE_ID = "damophus-mobile-title-path-style";
const MOBILE_TITLE_PATH_CSS = `
html[data-frontend="mobile"] .damophus-mobile-title-path,
html[data-frontend="browser-mobile"] .damophus-mobile-title-path { flex: 1; min-width: 1px; height: 48px; display: flex; flex-direction: column; justify-content: center; overflow: hidden; box-sizing: border-box; }
html[data-frontend="mobile"] .damophus-mobile-title-path > #toolbarName,
html[data-frontend="browser-mobile"] .damophus-mobile-title-path > #toolbarName { flex: 0 0 auto; width: 100%; height: 24px; min-height: 24px; box-sizing: border-box; line-height: 24px; font-size: 16px; }
html[data-frontend="mobile"] .damophus-mobile-title-path__location,
html[data-frontend="browser-mobile"] .damophus-mobile-title-path__location { display: block; height: 14px; min-height: 14px; overflow: hidden; color: var(--b3-theme-on-surface-light); font-size: 10px; line-height: 14px; text-overflow: ellipsis; white-space: nowrap; pointer-events: none; }
html[data-frontend="mobile"] .damophus-mobile-title-path > #toolbarName.fn__hidden + .damophus-mobile-title-path__location,
html[data-frontend="browser-mobile"] .damophus-mobile-title-path > #toolbarName.fn__hidden + .damophus-mobile-title-path__location { display: none; }
html[data-frontend="mobile"] .damophus-mobile-tab-path,
html[data-frontend="browser-mobile"] .damophus-mobile-tab-path { position: absolute; left: 32px; right: 28px; bottom: 3px; display: block; overflow: hidden; color: var(--b3-theme-on-surface-light); font-size: 10px; line-height: 13px; text-overflow: ellipsis; white-space: nowrap; pointer-events: none; }
html[data-frontend="mobile"] .mobile-tabs__item,
html[data-frontend="browser-mobile"] .mobile-tabs__item { position: relative; min-height: 58px; }
`;

export function readableParentPath(hpath: string): string {
  const segments = hpath.split("/").filter(Boolean);
  return segments.length <= 1 ? "/" : `/${segments.slice(0, -1).join("/")}`;
}

function normalizeTitle(value: string): string {
  return value.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").replace(/\.\.\./g, "").replace(/\s+/g, "").trim().toLowerCase();
}

export class MobileTitlePath {
  private wrapper?: HTMLDivElement;
  private location?: HTMLElement;
  private mountObserver?: MutationObserver;
  private cardObserver?: MutationObserver;
  private requestVersion = 0;

  constructor(private readonly getHPath: (id: string) => Promise<string> = getHPathByID) {}

  start(): void {
    if (!this.isMobileFrontend()) return;
    this.mountStyle();
    this.mountTabCards();
    const Observer = document.defaultView?.MutationObserver;
    if (!Observer) return;
    if (!this.mount()) {
      this.mountObserver = new Observer(() => {
        this.mountTabCards();
        if (!this.mount()) return;
        this.mountObserver?.disconnect();
        this.mountObserver = undefined;
      });
      this.mountObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
    if (!this.cardObserver) {
      this.cardObserver = new Observer(() => this.mountTabCards());
      this.cardObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  async show(protyle?: IProtyle): Promise<void> {
    this.start();
    const version = ++this.requestVersion;
    const rootId = protyle?.block.rootID;
    if (!rootId) return this.clear();
    try {
      const hpath = await this.getHPath(rootId);
      if (version !== this.requestVersion) return;
      const displayPath = readableParentPath(hpath);
      if (this.location) {
        this.location.textContent = displayPath;
        this.location.title = hpath;
      }
      this.updateActiveTabCard(displayPath, hpath);
    } catch {
      if (version === this.requestVersion) this.clear();
    }
  }

  destroy(): void {
    this.requestVersion += 1;
    this.mountObserver?.disconnect();
    this.cardObserver?.disconnect();
    const input = this.wrapper?.querySelector<HTMLInputElement>("#toolbarName");
    if (input && this.wrapper) this.wrapper.replaceWith(input);
    this.wrapper = undefined;
    this.location = undefined;
    document.querySelectorAll<HTMLElement>(".damophus-mobile-tab-path").forEach((element) => element.remove());
    document.getElementById(MOBILE_TITLE_PATH_STYLE_ID)?.remove();
  }

  private mount(): boolean {
    if (this.wrapper?.isConnected) return true;
    const input = document.getElementById("toolbarName");
    if (!(input instanceof HTMLInputElement) || !input.parentElement) return false;
    const wrapper = document.createElement("div");
    wrapper.className = "damophus-mobile-title-path";
    const location = document.createElement("small");
    location.className = "damophus-mobile-title-path__location";
    location.setAttribute("aria-label", "Document location");
    input.before(wrapper);
    wrapper.append(input, location);
    this.wrapper = wrapper;
    this.location = location;
    return true;
  }

  private mountStyle(): void {
    if (document.getElementById(MOBILE_TITLE_PATH_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = MOBILE_TITLE_PATH_STYLE_ID;
    style.textContent = MOBILE_TITLE_PATH_CSS;
    document.head?.append(style);
  }

  private clear(): void {
    if (this.location) {
      this.location.textContent = "";
      this.location.removeAttribute("title");
    }
    this.updateActiveTabCard("", "");
  }

  private mountTabCards(): void {
    if (!this.isMobileFrontend()) return;
    document.querySelectorAll<HTMLElement>(".mobile-tabs__item").forEach((card) => {
      if (card.querySelector(".damophus-mobile-tab-path")) return;
      const title = card.querySelector<HTMLElement>(".mobile-tabs__item-title");
      if (!title) return;
      const path = document.createElement("small");
      path.className = "damophus-mobile-tab-path";
      title.insertAdjacentElement("afterend", path);
    });
  }

  async showAll(editors: ReadonlyArray<{ protyle?: IProtyle }>): Promise<void> {
    this.start();
    this.mountTabCards();
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".mobile-tabs__item"));
    await Promise.all(cards.map(async (card, index) => {
      const rootId = editors[index]?.protyle?.block.rootID;
      const target = card.querySelector<HTMLElement>(".damophus-mobile-tab-path");
      if (!target || !rootId) {
        if (target) target.textContent = "";
        return;
      }
      try {
        const hpath = await this.getHPath(rootId);
        target.textContent = readableParentPath(hpath);
        target.title = hpath;
      } catch {
        target.textContent = "";
        target.removeAttribute("title");
      }
    }));
  }

  async showTabs(tabs: ReadonlyArray<{ id?: string; model?: unknown; headElement?: HTMLElement }>): Promise<void> {
    this.start();
    this.mountTabCards();
    await Promise.all(Array.from(document.querySelectorAll<HTMLElement>(".mobile-tabs__item")).map(async (card, index) => {
      const target = card.querySelector<HTMLElement>(".damophus-mobile-tab-path");
      const tab = tabs[index];
      const editor = (tab?.model as { editor?: { protyle?: IProtyle } } | undefined)?.editor;
      let rootId = editor?.protyle?.block.rootID;
      if (!rootId) {
        const initData = tab?.headElement?.getAttribute("data-initdata");
        if (initData) {
          try { rootId = JSON.parse(initData).rootId; } catch { /* ignore malformed host metadata */ }
        }
      }
      if (!target || !rootId) return;
      try {
        const hpath = await this.getHPath(rootId);
        target.textContent = readableParentPath(hpath);
        target.title = hpath;
      } catch { target.textContent = ""; }
    }));
  }

  async showCardsFromDatabase(): Promise<void> {
    this.start();
    this.mountTabCards();
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".mobile-tabs__item"));
    const titles = cards.map((card) => card.querySelector<HTMLElement>(".mobile-tabs__item-title")?.textContent?.trim() ?? "").filter(Boolean);
    if (titles.length === 0) return;
    let rows: Array<{ id?: string; name?: string; content?: string }> = [];
    try {
      rows = await sql("select id, name, content, hpath from blocks where type='d' order by created") as typeof rows;
    } catch {
      return;
    }
    const byTitle = new Map<string, string[]>();
    for (const row of rows as Array<{ id?: string; name?: string; content?: string; hpath?: string }>) {
      if (!row.id) continue;
      const hpathName = row.hpath?.split("/").filter(Boolean).pop();
      for (const value of [row.name, row.content, hpathName]) {
        if (!value) continue;
        const normalized = normalizeTitle(value);
        const list = byTitle.get(normalized) ?? [];
        if (!list.includes(row.id)) list.push(row.id);
        byTitle.set(normalized, list);
      }
    }
    await Promise.all(cards.map(async (card) => {
      const title = card.querySelector<HTMLElement>(".mobile-tabs__item-title")?.textContent?.trim() ?? "";
      const target = card.querySelector<HTMLElement>(".damophus-mobile-tab-path");
      const normalizedTitle = normalizeTitle(title);
      const exact = byTitle.get(normalizedTitle);
      const fuzzy = exact ?? [...byTitle.entries()].find(([key]) => key.includes(normalizedTitle) || normalizedTitle.includes(key))?.[1];
      const id = fuzzy?.shift();
      if (!target || !id) return;
      try {
        const hpath = await this.getHPath(id);
        target.textContent = readableParentPath(hpath);
        target.title = hpath;
      } catch { target.textContent = ""; }
    }));
  }

  private updateActiveTabCard(path: string, fullPath: string): void {
    this.mountTabCards();
    document.querySelectorAll<HTMLElement>(".mobile-tabs__item").forEach((card) => {
      const target = card.querySelector<HTMLElement>(".damophus-mobile-tab-path");
      if (!target) return;
      const active = card.classList.contains("mobile-tabs__item--active");
      if (active) {
        target.textContent = path;
        target.hidden = !path;
      }
      if (fullPath) target.title = fullPath;
      else target.removeAttribute("title");
    });
  }

  private isMobileFrontend(): boolean {
    if (typeof document === "undefined") return false;
    const frontend = document.documentElement?.dataset?.frontend;
    return frontend === "mobile" || frontend === "browser-mobile";
  }
}
