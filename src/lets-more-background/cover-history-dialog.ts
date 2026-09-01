import { Dialog, showMessage } from "siyuan";
import { getLogger } from "@/libs/logger";
import { isMobile } from "@/utils";
import { clearCoverHistory, getCoverHistory, removeCoverHistoryEntry } from "./cover-history";
import type { CoverHistoryEntry } from "./sources";
import type { CoverApplyService } from "./cover-service";

const log = getLogger("lets-more-background");

export interface CoverHistoryDialogDeps {
  t: (key: string) => string;
  service: CoverApplyService;
}

/** Reads the visible cover history and offers per-entry re-apply / removal. */
export function openCoverHistoryDialog(background: HTMLElement, deps: CoverHistoryDialogDeps): void {
  const { t, service } = deps;
  const dialog = new Dialog({
    title: t("lets-more-background.coverHistory"),
    content: '<div class="damophus-cover-history-host" style="height: 100%; overflow: auto;"></div>',
    width: isMobile ? "100vw" : "min(92vw, 760px)",
    height: isMobile ? "100dvh" : "min(85dvh, 680px)",
  });
  const host = dialog.element.querySelector<HTMLElement>(".damophus-cover-history-host");
  if (!host) {
    dialog.destroy();
    return;
  }

  const render = (): void => {
    host.replaceChildren();
    const history = getCoverHistory();
    const heading = document.createElement("div");
    heading.className = "fn__flex fn__flex-center";
    heading.style.cssText = "justify-content:space-between;gap:8px;padding:8px 4px 12px;";
    const count = document.createElement("span");
    count.textContent = `${t("lets-more-background.coverHistoryDescription")} (${history.length})`;
    count.style.color = "var(--b3-theme-on-surface-light)";
    heading.appendChild(count);
    if (history.length > 0) {
      const clear = document.createElement("button");
      clear.className = "b3-button b3-button--cancel";
      clear.textContent = t("lets-more-background.clearCoverHistory");
      clear.addEventListener("click", () => {
        clearCoverHistory();
        render();
      });
      heading.appendChild(clear);
    }
    host.appendChild(heading);

    if (history.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = t("lets-more-background.emptyCoverHistory");
      empty.style.cssText = "padding:32px 12px;text-align:center;color:var(--b3-theme-on-surface-light);";
      host.appendChild(empty);
      return;
    }

    for (const entry of history) {
      const row = document.createElement("div");
      row.className = "b3-list-item fn__flex";
      row.style.cssText = "gap:10px;align-items:center;padding:8px 4px;border-top:1px solid var(--b3-border-color);";
      const image = document.createElement("img");
      image.src = entry.imageUrl;
      image.alt = entry.docTitle || t("lets-more-background.coverHistory");
      image.referrerPolicy = "no-referrer";
      image.style.cssText = "width:88px;height:54px;object-fit:cover;border-radius:3px;background:var(--b3-theme-surface-lighter);flex:none;";
      row.appendChild(image);

      const details = document.createElement("div");
      details.style.cssText = "min-width:0;flex:1;line-height:1.5;";
      const title = document.createElement("div");
      title.textContent = entry.docTitle || t("lets-more-background.currentDocument");
      title.style.cssText = "font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      details.appendChild(title);
      const meta = document.createElement("div");
      const tags = entry.tags?.slice(0, 5).join(" ");
      const kindLabel = entry.kind === "replaced"
        ? t("lets-more-background.coverHistoryReplacedBadge")
        : "";
      meta.textContent = [kindLabel, entry.site, entry.postId ? `#${entry.postId}` : "", tags, new Date(entry.appliedAt).toLocaleString()].filter(Boolean).join(" · ");
      meta.style.cssText = "font-size:11px;color:var(--b3-theme-on-surface-light);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      details.appendChild(meta);
      row.appendChild(details);

      const apply = document.createElement("button");
      apply.className = "b3-button b3-button--outline";
      apply.textContent = t("lets-more-background.applyCoverHistory");
      apply.addEventListener("click", () => {
        void applyCoverHistoryEntry(entry, background, dialog);
      });
      row.appendChild(apply);
      const remove = document.createElement("button");
      remove.className = "b3-button b3-button--cancel";
      remove.textContent = t("lets-more-background.removeCoverHistory");
      remove.addEventListener("click", () => {
        removeCoverHistoryEntry(entry.id);
        render();
      });
      row.appendChild(remove);
      host.appendChild(row);
    }
  };

  async function applyCoverHistoryEntry(
    entry: CoverHistoryEntry,
    target: HTMLElement,
    owner: Dialog,
  ): Promise<void> {
    const postInfo = {
      imageUrl: entry.imageUrl,
      postUrl: entry.postUrl,
      site: entry.site,
      postId: entry.postId,
      tags: entry.tags,
    };
    service.applyPostMetadata(target, postInfo);
    try {
      if (/^(?:https?:\/\/|data:)/i.test(entry.imageUrl)) {
        await service.fetchAndSetBackground(entry.imageUrl, target, 1, 1, undefined, postInfo);
      } else {
        await service.setBlockBackgroundImage(target, entry.imageUrl, postInfo, undefined, entry.sourceUrl);
      }
      owner.destroy();
      showMessage(t("lets-more-background.coverHistoryApplied"));
    } catch (error) {
      log.warn("Failed to apply cover history entry:", error);
      showMessage(t("lets-more-background.manualCoverFailed"));
    }
  }

  render();
}
