const OUTLINE_SELECTOR = '#sidebar [data-type="sidebar-outline"]';
const THEME_OUTLINE_CLASSES = ["file-tree", "sy__outline"] as const;

export class MobileOutlineThemeCompatibility {
  private readonly addedClasses = new Map<HTMLElement, Set<string>>();
  private mountObserver?: MutationObserver;

  start(): void {
    if (!this.isMobileFrontend()) return;
    if (this.mount()) return;
    const Observer = document.defaultView?.MutationObserver;
    if (!Observer) return;
    this.mountObserver = new Observer(() => {
      if (!this.mount()) return;
      this.mountObserver?.disconnect();
      this.mountObserver = undefined;
    });
    this.mountObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  destroy(): void {
    this.mountObserver?.disconnect();
    for (const [element, classes] of this.addedClasses) element.classList.remove(...classes);
    this.addedClasses.clear();
  }

  private mount(): boolean {
    const outline = document.querySelector<HTMLElement>(OUTLINE_SELECTOR);
    if (!outline) return false;
    let added = this.addedClasses.get(outline);
    for (const className of THEME_OUTLINE_CLASSES) {
      if (outline.classList.contains(className)) continue;
      outline.classList.add(className);
      added ??= new Set<string>();
      added.add(className);
    }
    if (added) this.addedClasses.set(outline, added);
    return true;
  }

  private isMobileFrontend(): boolean {
    const frontend = document.documentElement.dataset.frontend;
    return frontend === "mobile" || frontend === "browser-mobile";
  }
}
