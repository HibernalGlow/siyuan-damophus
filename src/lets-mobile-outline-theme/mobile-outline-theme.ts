const MOBILE_OUTLINE_SELECTOR = '#sidebar [data-type="sidebar-outline"]';
const THEME_OUTLINE_CLASSES = ["file-tree", "sy__outline"] as const;

export class MobileOutlineThemeCompatibility {
  private readonly addedClasses = new Map<HTMLElement, Set<string>>();
  private mountObserver?: MutationObserver;

  constructor(private readonly targetDocument: Document = document) {}

  start(): void {
    if (!this.isMobileFrontend()) return;
    if (this.mount()) return;
    const Observer = this.targetDocument.defaultView?.MutationObserver;
    if (!Observer) return;
    this.mountObserver = new Observer(() => {
      if (!this.mount()) return;
      this.mountObserver?.disconnect();
      this.mountObserver = undefined;
    });
    this.mountObserver.observe(this.targetDocument.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  destroy(): void {
    this.mountObserver?.disconnect();
    this.mountObserver = undefined;
    for (const [element, classes] of this.addedClasses) {
      element.classList.remove(...classes);
    }
    this.addedClasses.clear();
  }

  private mount(): boolean {
    const outline = this.targetDocument.querySelector<HTMLElement>(MOBILE_OUTLINE_SELECTOR);
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
    const frontend = this.targetDocument.documentElement.dataset.frontend;
    return frontend === "mobile" || frontend === "browser-mobile";
  }
}
