import { Menu, showMessage } from "siyuan";
import { isMobile, plugin } from "@/utils";
import { settings } from "@/settings";
import { openCoverTagViewer } from "./tag-viewer";
import { DEFAULT_COVER_SOURCES, type CoverSourceItem } from "./sources";
import { getGachaDrawCount, getCoverStashCountSync, loadCoverStash } from "./cover-gacha";
import { getCoverHistory } from "./cover-history";
import type { CoverSurfaceActions } from "./cover-actions";

/**
 * The background context menu: tag viewer, per-template random apply, gacha
 * switches, stash browsing, apply-behaviour toggles, manual URL, history,
 * clipboard/assets sources and the settings entry.
 */
export async function showBackgroundMenu(
  rect: DOMRect,
  root: HTMLElement,
  background: HTMLElement,
  actions: CoverSurfaceActions,
): Promise<void> {
  const options = actions.getOptions();
  const menu = new Menu("DamophusMoreBackground");
  const sources = options.sources?.length ? options.sources : DEFAULT_COVER_SOURCES;
  const stashCount = getCoverStashCountSync() || (await loadCoverStash()).length;

  const currentPostTags =
    background.getAttribute("data-damophus-post-tags") ||
    background.querySelector("img")?.getAttribute("data-damophus-post-tags") ||
    "";
  const currentPostUrl =
    background.getAttribute("data-damophus-post-url") ||
    background.querySelector("img")?.getAttribute("data-damophus-post-url") ||
    "";
  const currentPostSite = background.getAttribute("data-damophus-post-site") || "";
  const currentPostId = background.getAttribute("data-damophus-post-id") || "";
  const currentDimensions = background.getAttribute("data-damophus-post-dimensions") || "";
  const currentScore = background.getAttribute("data-damophus-post-score") || "";

  if (currentPostTags || currentPostUrl) {
    menu.addItem({
      label: "🏷️ 查看当前题头图 Tag 标签 (中英对照)",
      icon: "iconTag",
      click: () => {
        openCoverTagViewer({
          site: currentPostSite,
          postId: currentPostId,
          postUrl: currentPostUrl,
          tags: currentPostTags,
          score: currentScore,
          width: currentDimensions ? currentDimensions.split("×")[0]?.trim() : "",
          height: currentDimensions ? currentDimensions.split("×")[1]?.trim() : "",
        });
      },
    });

    if (currentPostUrl) {
      menu.addItem({
        label: "🌐 打开当前题头图原帖 (Booru Post ↗)",
        icon: "iconLink",
        click: () => {
          window.open(currentPostUrl, "_blank");
        },
      });
    }
    menu.addSeparator();
  }

  sources.forEach((item: CoverSourceItem) => {
    if (!item.label && !item.url) return;
    menu.addItem({
      label: item.label || item.url,
      icon: "iconImage",
      click: () => actions.applyRandomSource(item, root, background),
    });
  });

  menu.addSeparator();

  // 抽卡模式：开启后使用任何模板先抽出多张候选卡弹窗选择；星标可收藏进暂存区。
  const isGacha = options.gachaMode === true;
  menu.addItem({
    label: `${isGacha ? "✓ " : ""}🎴 ${options.t("lets-more-background.gachaMode")}`,
    icon: "iconImage",
    click: () => {
      const nextVal = !isGacha;
      options.gachaMode = nextVal;
      try {
        settings.setBySpace("moreBackground", "gachaMode", nextVal);
        void settings.save();
      } catch {}
      showMessage(options.t(nextVal
        ? "lets-more-background.gachaModeEnabled"
        : "lets-more-background.gachaModeDisabled"));
    },
  });

  const gachaDrawCount = getGachaDrawCount(options);
  menu.addItem({
    label: `🎯 ${options.t("lets-more-background.gachaDrawCount")}: ${gachaDrawCount}`,
    icon: "iconFilter",
    submenu: [2, 3, 4, 6, 8, 9, 12].map((count) => ({
      label: `${count === gachaDrawCount ? "✓ " : ""}${count}`,
      click: () => {
        options.gachaDrawCount = count;
        try {
          settings.setBySpace("moreBackground", "gachaDrawCount", count);
          void settings.save();
        } catch {}
        showMessage(
          options.t("lets-more-background.gachaDrawCountSet").replace("{count}", String(count)),
        );
      },
    })),
  });

  // 暂存区浏览：全部暂存卡铺开，点选即应用并移出暂存区。
  menu.addItem({
    label: `🗂 ${options.t("lets-more-background.applyFromStash")}${stashCount > 0 ? ` (${stashCount})` : ""}`,
    icon: "iconEye",
    click: () => { void actions.applyFromStash(root, background); },
  });

  menu.addSeparator();

  const isAutoCover = options.autoAddCoverOnEmptyDoc === true;
  menu.addItem({
    label: `${isAutoCover ? "✓ " : ""}${options.t("lets-more-background.autoAddCoverOnEmptyDoc")}`,
    icon: "iconSparkles",
    click: () => {
      const nextVal = !isAutoCover;
      options.autoAddCoverOnEmptyDoc = nextVal;
      try {
        settings.setBySpace("moreBackground", "autoAddCoverOnEmptyDoc", nextVal);
        void settings.save();
      } catch {}
      showMessage(options.t(nextVal
        ? "lets-more-background.autoAddCoverOnEmptyDocEnabled"
        : "lets-more-background.autoAddCoverOnEmptyDocDisabled"));
    },
  });

  const isAutoRetry = options.autoRetryOnFailure !== false;
  menu.addItem({
    label: `${isAutoRetry ? "✓ " : ""}${options.t("lets-more-background.autoRetryOnFailure")}`,
    icon: "iconRefresh",
    click: () => {
      const nextVal = !isAutoRetry;
      options.autoRetryOnFailure = nextVal;
      try {
        settings.setBySpace("moreBackground", "autoRetryOnFailure", nextVal);
        void settings.save();
      } catch {}
      showMessage(options.t(nextVal
        ? "lets-more-background.autoRetryOnFailureEnabled"
        : "lets-more-background.autoRetryOnFailureDisabled"));
    },
  });

  const isDeduplicationEnabled = options.deduplicateNewCovers !== false;
  menu.addItem({
    label: `${isDeduplicationEnabled ? "✓ " : ""}${options.t("lets-more-background.deduplicateNewCovers")}`,
    icon: "iconFilter",
    click: () => {
      const nextVal = !isDeduplicationEnabled;
      options.deduplicateNewCovers = nextVal;
      try {
        settings.setBySpace("moreBackground", "deduplicateNewCovers", nextVal);
        void settings.save();
      } catch {}
      showMessage(options.t(nextVal
        ? "lets-more-background.deduplicateNewCoversEnabled"
        : "lets-more-background.deduplicateNewCoversDisabled"));
    },
  });

  if (options.localCache) {
    const isPurgeEnabled = options.purgeCacheOnCoverChange === true;
    menu.addItem({
      label: `${isPurgeEnabled ? "✓ " : ""}${options.t("lets-more-background.purgeCacheOnCoverChange")}`,
      icon: "iconTrashcan",
      click: () => {
        const nextVal = !isPurgeEnabled;
        options.purgeCacheOnCoverChange = nextVal;
        try {
          settings.setBySpace("moreBackground", "purgeCacheOnCoverChange", nextVal);
          void settings.save();
        } catch {}
        showMessage(options.t(nextVal
          ? "lets-more-background.purgeCacheOnCoverChangeEnabled"
          : "lets-more-background.purgeCacheOnCoverChangeDisabled"));
      },
    });
  }

  menu.addSeparator();

  menu.addItem({
    label: options.t("lets-more-background.manualCoverUrl"),
    icon: "iconLink",
    click: () => { void actions.applyManualCoverUrl(background); },
  });

  menu.addItem({
    label: `${options.t("lets-more-background.coverHistory")}${getCoverHistory().length ? ` (${getCoverHistory().length})` : ""}`,
    icon: "iconHistory",
    click: () => actions.openCoverHistory(background),
  });

  menu.addItem({
    label: options.t("lets-more-background.uploadFromClipboard"),
    icon: "iconCopy",
    click: () => actions.applyFromClipboard(root, background),
  });

  if (options.readFromAssets) {
    menu.addItem({
      label: options.t("lets-more-background.loadFromAssets"),
      icon: "iconUpload",
      click: () => actions.applyFromAssets(root, background),
    });
  }

  menu.addSeparator();

  menu.addItem({
    label: options.t("lets-more-background.openSetting"),
    icon: "iconSettings",
    click: () => {
      plugin.openSetting();
    },
  });

  if (isMobile) {
    menu.fullscreen();
  } else {
    menu.open({ x: rect.left, y: rect.bottom, isLeft: false });
  }
}
