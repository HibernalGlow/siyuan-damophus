import type { CoverSourceItem } from "./sources";
import type { MoreBackgroundOptions } from "./more-background";

/**
 * The controller-side actions consumed by the injected cover surfaces (title
 * buttons, background menu). Implemented by MoreBackgroundController; keeps
 * the UI modules decoupled from the controller class.
 */
export interface CoverSurfaceActions {
  getOptions(): MoreBackgroundOptions;
  applyRandomSource(item: CoverSourceItem, root: HTMLElement, background: HTMLElement): Promise<void>;
  showBackgroundMenu(rect: DOMRect, root: HTMLElement, background: HTMLElement): Promise<void>;
  applyManualCoverUrl(background: HTMLElement): Promise<void>;
  openCoverHistory(background: HTMLElement): void;
  applyFromClipboard(root: HTMLElement, background: HTMLElement): Promise<void>;
  applyFromAssets(root: HTMLElement, background: HTMLElement): Promise<void>;
  applyFromStash(root: HTMLElement, background: HTMLElement): Promise<void>;
  toggleCoverFavorite(root: HTMLElement, background: HTMLElement, button: HTMLElement): Promise<void>;
  refreshFavoriteButton(root: HTMLElement, background: HTMLElement, button: HTMLElement): Promise<void>;
}
