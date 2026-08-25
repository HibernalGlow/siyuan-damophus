import type { Dialog } from "siyuan";

export interface MobileFlashcardSurfaceAdapter {
  openSettings(
    title: string,
    mount: (target: HTMLElement, close: () => void) => void,
    onDestroy: () => void,
  ): void;
  openReview(scope?: { type: "document" | "notebook" }, mobile?: boolean): boolean;
}

/**
 * Mobile SiYuan 3.8.x has no-op openTab(). Keep the workaround behind this
 * adapter so the plugin can switch to the native API when it becomes usable.
 */
export class SiyuanMobileFlashcardSurfaceAdapter implements MobileFlashcardSurfaceAdapter {
  private settingsDialog?: Dialog;

  constructor(private readonly DialogCtor: new (options: {
    title: string;
    content: string;
    width: string;
    height: string;
    destroyCallback: () => void;
  }) => Dialog) {}

  openSettings(title: string, mount: (target: HTMLElement, close: () => void) => void, onDestroy: () => void): void {
    if (this.settingsDialog) return;
    const dialog = new this.DialogCtor({
      title,
      content: '<div class="damophus-flashcard-mobile-settings"></div>',
      width: "94vw",
      height: "calc(100dvh - 24px)",
      destroyCallback: () => {
        this.settingsDialog = undefined;
        onDestroy();
      },
    });
    this.settingsDialog = dialog;
    const target = dialog.element.querySelector<HTMLElement>(".damophus-flashcard-mobile-settings");
    if (!target) {
      dialog.destroy();
      return;
    }
    mount(target, () => dialog.destroy());
  }

  openReview(scope?: { type: "document" | "notebook" }, mobile = true): boolean {
    if (scope?.type === "document") {
      const titleButton = document.querySelector<HTMLElement>('button[data-type="doc"]');
      if (!titleButton) return false;
      titleButton.click();
      const menu = document.querySelector<HTMLElement>("#commonMenu");
      const previousVisibility = menu?.style.visibility;
      if (menu) menu.style.visibility = "hidden";
      const startedAt = Date.now();
      let completed = false;
      const restoreMenu = (): void => {
        if (completed) return;
        completed = true;
        if (menu) menu.style.visibility = previousVisibility ?? "";
      };
      const findReviewItem = (): void => {
        const reviewItem = document.querySelector<HTMLElement>('.b3-menu__item[data-id="spaceRepetition"]');
        if (reviewItem) {
          restoreMenu();
          reviewItem.click();
          return;
        }
        if (Date.now() - startedAt < 3000) {
          globalThis.setTimeout(findReviewItem, 50);
        } else {
          restoreMenu();
        }
      };
      globalThis.setTimeout(findReviewItem, 0);
      return true;
    }
    if (!scope) {
      const globalEntry = document.querySelector<HTMLElement>(mobile ? "#menuCard" : "#barMore")
        ?? (!mobile ? document.querySelector<HTMLElement>("#barWorkspace") : null);
      if (!globalEntry) return false;
      globalEntry.click();
      if (!mobile) {
        this.clickWhenAvailable('.b3-menu__item[data-id="spaceRepetition"]', '#barWorkspace');
      }
      return true;
    }
    return false;
  }

  private clickWhenAvailable(selector: string, workspaceFallback?: string): void {
    const startedAt = Date.now();
    const findItem = (): void => {
      const item = document.querySelector<HTMLElement>(selector);
      if (item) {
        item.click();
        return;
      }
      if (workspaceFallback && Date.now() - startedAt > 150 && Date.now() - startedAt < 300) {
        document.querySelector<HTMLElement>(workspaceFallback)?.click();
      }
      if (Date.now() - startedAt < 3000) globalThis.setTimeout(findItem, 50);
    };
    globalThis.setTimeout(findItem, 0);
  }
}
