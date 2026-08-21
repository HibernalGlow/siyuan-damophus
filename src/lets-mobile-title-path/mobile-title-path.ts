export const MOBILE_TITLE_PATH_STYLE_ID = "damophus-mobile-title-path-style";

const MOBILE_TITLE_PATH_CSS = `
html[data-frontend="mobile"] .damophus-mobile-title-path,
html[data-frontend="browser-mobile"] .damophus-mobile-title-path {
  flex: 1;
  min-width: 1px;
  height: 48px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
  box-sizing: border-box;
}

html[data-frontend="mobile"] .damophus-mobile-title-path > #toolbarName,
html[data-frontend="browser-mobile"] .damophus-mobile-title-path > #toolbarName {
  flex: 0 0 auto;
  width: 100%;
  height: 24px;
  min-height: 24px;
  box-sizing: border-box;
  line-height: 24px;
  font-size: 16px;
}

html[data-frontend="mobile"] .damophus-mobile-title-path__location,
html[data-frontend="browser-mobile"] .damophus-mobile-title-path__location {
  display: block;
  height: 14px;
  min-height: 14px;
  overflow: hidden;
  color: var(--b3-theme-on-surface-light);
  font-size: 10px;
  line-height: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}

html[data-frontend="mobile"] .damophus-mobile-title-path > #toolbarName.fn__hidden + .damophus-mobile-title-path__location,
html[data-frontend="browser-mobile"] .damophus-mobile-title-path > #toolbarName.fn__hidden + .damophus-mobile-title-path__location {
  display: none;
}
`;

export function readableParentPath(hpath: string): string {
  const segments = hpath.split("/").filter(Boolean);
  if (segments.length <= 1) return "/";
  return `/${segments.slice(0, -1).join("/")}`;
}

function isMobileFrontend(root: HTMLElement): boolean {
  return root.dataset.frontend === "mobile" || root.dataset.frontend === "browser-mobile";
}

export class MobileTitlePath {
  private wrapper?: HTMLDivElement;
  private location?: HTMLElement;
  private mountObserver?: MutationObserver;
  private requestVersion = 0;

  constructor(
    private readonly getHPath: (id: string) => Promise<string>,
    private readonly targetDocument: Document = document,
  ) {}

  start(): void {
    if (!isMobileFrontend(this.targetDocument.documentElement)) return;
    this.mountStyle();
    if (this.mount()) return;
    const Observer = this.targetDocument.defaultView?.MutationObserver;
    if (!Observer) return;
    this.mountObserver = new Observer(() => {
      if (!this.mount()) return;
      this.mountObserver?.disconnect();
      this.mountObserver = undefined;
    });
    this.mountObserver.observe(this.targetDocument.documentElement, { childList: true, subtree: true });
  }

  async show(rootId?: string): Promise<void> {
    this.start();
    const version = ++this.requestVersion;
    if (!rootId) {
      this.clear();
      return;
    }
    try {
      const hpath = await this.getHPath(rootId);
      if (version !== this.requestVersion || !this.location) return;
      this.location.textContent = readableParentPath(hpath);
      this.location.title = hpath;
      this.location.dataset.rootId = rootId;
    } catch {
      if (version === this.requestVersion) this.clear();
    }
  }

  destroy(): void {
    this.requestVersion += 1;
    this.mountObserver?.disconnect();
    this.mountObserver = undefined;
    const input = this.wrapper?.querySelector<HTMLInputElement>("#toolbarName");
    if (input && this.wrapper) this.wrapper.replaceWith(input);
    this.wrapper = undefined;
    this.location = undefined;
    this.targetDocument.getElementById(MOBILE_TITLE_PATH_STYLE_ID)?.remove();
  }

  private mount(): boolean {
    if (this.wrapper?.isConnected) return true;
    const input = this.targetDocument.getElementById("toolbarName");
    if (!(input instanceof HTMLInputElement) || !input.parentElement) return false;
    const wrapper = this.targetDocument.createElement("div");
    wrapper.className = "damophus-mobile-title-path";
    const location = this.targetDocument.createElement("small");
    location.className = "damophus-mobile-title-path__location";
    location.setAttribute("aria-label", "Document location");
    input.before(wrapper);
    wrapper.append(input, location);
    this.wrapper = wrapper;
    this.location = location;
    return true;
  }

  private mountStyle(): void {
    if (this.targetDocument.getElementById(MOBILE_TITLE_PATH_STYLE_ID)) return;
    const style = this.targetDocument.createElement("style");
    style.id = MOBILE_TITLE_PATH_STYLE_ID;
    style.textContent = MOBILE_TITLE_PATH_CSS;
    this.targetDocument.head?.append(style);
  }

  private clear(): void {
    if (!this.location) return;
    this.location.textContent = "";
    this.location.removeAttribute("title");
    delete this.location.dataset.rootId;
  }
}
