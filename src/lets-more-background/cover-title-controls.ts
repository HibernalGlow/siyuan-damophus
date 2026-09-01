import { confirm } from "siyuan";
import { getLastUsedSource } from "./cover-last-used";
import { openTagViewerForBackground } from "./tag-viewer";
import { DEFAULT_COVER_SOURCES } from "./sources";
import type { CoverSurfaceActions } from "./cover-actions";

const BUTTON_ATTR = "data-damophus-more-background";
const FAVORITE_BUTTON_ATTR = "data-damophus-cover-favorite";

function setNativeSymbolIcon(host: HTMLElement, symbol: string): void {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${symbol}`);
  use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", `#${symbol}`);
  svg.appendChild(use);
  host.replaceChildren(svg);
}

/**
 * Injects the Damophus cover entry points into the document header:
 * last-template / template-picker buttons next to the native actions, plus
 * random-apply / tag-viewer / favorite icons in the cover's top icon strip.
 * Also guards native cover removal with a confirmation.
 */
export function initTitleCoverControls(root: HTMLElement, actions: CoverSurfaceActions): () => void {
  const options = actions.getOptions();
  const injectButtons = () => {
    if (!root.isConnected) return;
    const currentOptions = actions.getOptions();
    const sources = currentOptions.sources?.length ? currentOptions.sources : DEFAULT_COVER_SOURCES;
    const lastUsed = getLastUsedSource() || sources[0];

    // 1. 未添加题头图时：在 .protyle-background__action / .protyle-background__tags 注入按钮
    const actionContainers = root.querySelectorAll<HTMLElement>(
      ".protyle-background__action, .protyle-background__tags",
    );

    actionContainers.forEach((container) => {
      if (container.querySelector("[data-damophus-more-background-title-btn]")) return;

      const isButtonType = container.classList.contains("protyle-background__action");
      const randomBtn =
        container.querySelector<HTMLElement>('[data-type="random"]') ||
        container.querySelector<HTMLElement>('[data-type="background"]') ||
        container.querySelector<HTMLElement>('[data-type="tag"]') ||
        (container.lastElementChild as HTMLElement);

      const lastLabel = lastUsed?.label ? `${lastUsed.label}` : currentOptions.t("lets-more-background.useLastTemplate");
      const chooseLabel = currentOptions.t("lets-more-background.chooseTemplate");

      if (isButtonType) {
        // 按钮 1: ⚡ 使用上次配置 (一键出图，无需二次点击)
        const lastBtn = document.createElement("button");
        lastBtn.className = "b3-button b3-button--cancel";
        lastBtn.setAttribute("data-damophus-more-background-title-btn", "true");
        lastBtn.setAttribute("data-type", "more-background-last");
        lastBtn.title = `使用上次配置: ${lastLabel}`;
        lastBtn.innerHTML = `<svg><use xlink:href="#iconRefresh"></use></svg><span class="damophus-last-label">⚡ ${lastLabel}</span>`;

        // 按钮 2: 🎨 选择模板 (弹出菜单)
        const menuBtn = document.createElement("button");
        menuBtn.className = "b3-button b3-button--cancel";
        menuBtn.setAttribute("data-damophus-more-background-title-btn", "true");
        menuBtn.setAttribute("data-type", "more-background-menu");
        menuBtn.title = chooseLabel;
        menuBtn.innerHTML = `<svg><use xlink:href="#iconImage"></use></svg><span>${chooseLabel}</span>`;

        if (randomBtn) {
          randomBtn.after(menuBtn);
          randomBtn.after(lastBtn);
        } else {
          container.appendChild(lastBtn);
          container.appendChild(menuBtn);
        }

        lastBtn.addEventListener("click", (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          const currentSources = actions.getOptions().sources?.length ? actions.getOptions().sources : DEFAULT_COVER_SOURCES;
          const currentLast = getLastUsedSource() || currentSources![0];
          if (currentLast) {
            const bg = root.querySelector<HTMLElement>(".protyle-background") || root;
            void actions.applyRandomSource(currentLast, root, bg);
          }
        });

        menuBtn.addEventListener("click", (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          const rect = menuBtn.getBoundingClientRect();
          const bg = root.querySelector<HTMLElement>(".protyle-background") || root;
          void actions.showBackgroundMenu(rect, root, bg);
        });
      } else {
        // 标签风格
        const spanLast = document.createElement("span");
        spanLast.className = "protyle-background__tag protyle-background__tag--text";
        spanLast.setAttribute("data-damophus-more-background-title-btn", "true");
        spanLast.setAttribute("data-type", "more-background-last");
        spanLast.style.cursor = "pointer";
        spanLast.title = `使用上次配置: ${lastLabel}`;
        spanLast.innerHTML = `<svg class="svg"><use xlink:href="#iconRefresh"></use></svg><span class="damophus-last-label">⚡ ${lastLabel}</span>`;

        const spanMenu = document.createElement("span");
        spanMenu.className = "protyle-background__tag protyle-background__tag--text";
        spanMenu.setAttribute("data-damophus-more-background-title-btn", "true");
        spanMenu.setAttribute("data-type", "more-background-menu");
        spanMenu.style.cursor = "pointer";
        spanMenu.title = chooseLabel;
        spanMenu.innerHTML = `<svg class="svg"><use xlink:href="#iconImage"></use></svg><span>${chooseLabel}</span>`;

        if (randomBtn) {
          randomBtn.after(spanMenu);
          randomBtn.after(spanLast);
        } else {
          container.appendChild(spanLast);
          container.appendChild(spanMenu);
        }

        spanLast.addEventListener("click", (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          const currentSources = actions.getOptions().sources?.length ? actions.getOptions().sources : DEFAULT_COVER_SOURCES;
          const currentLast = getLastUsedSource() || currentSources![0];
          if (currentLast) {
            const bg = root.querySelector<HTMLElement>(".protyle-background") || root;
            void actions.applyRandomSource(currentLast, root, bg);
          }
        });

        spanMenu.addEventListener("click", (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          const rect = spanMenu.getBoundingClientRect();
          const bg = root.querySelector<HTMLElement>(".protyle-background") || root;
          void actions.showBackgroundMenu(rect, root, bg);
        });
      }
    });

    // 2. 已有题头图时：注入右上角操作条中的随机图源按钮与 Tag 详情按钮 (.protyle-icons)
    const topIcons = root.querySelectorAll<HTMLElement>(
      ".protyle-top .protyle-icons, .protyle-background .protyle-icons, .protyle-background__img .protyle-icons",
    );
    topIcons.forEach((iconsContainer) => {
      const firstIcon =
        iconsContainer.querySelector(".protyle-icon.ariaLabel") || iconsContainer.firstElementChild;
      if (!firstIcon) return;

      if (!iconsContainer.querySelector(`[${BUTTON_ATTR}]`)) {
        // 按钮 1: 随机换图 / 模板菜单
        const button = document.createElement("span");
        button.className = "protyle-icon ariaLabel";
        button.setAttribute(BUTTON_ATTR, "true");
        button.setAttribute("data-link", "more-background");
        button.setAttribute("aria-label", options.t("lets-more-background.moreBackgroundBtn"));
        button.innerHTML = '<svg><use xlink:href="#iconImage"></use></svg>';

        button.addEventListener("click", (e: MouseEvent) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const bg = root.querySelector<HTMLElement>(".protyle-background") || root;
          void actions.showBackgroundMenu(rect, root, bg);
        });

        // 按钮 2: Tag 标签查看按钮
        const tagButton = document.createElement("span");
        tagButton.className = "protyle-icon ariaLabel";
        tagButton.setAttribute(BUTTON_ATTR, "true");
        tagButton.setAttribute("data-link", "more-background-tag");
        tagButton.setAttribute("aria-label", "查看题头图 Tag 标签 (中英对照)");
        tagButton.innerHTML = '<svg><use xlink:href="#iconTag"></use></svg>';

        tagButton.addEventListener("click", (e: MouseEvent) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          const bg = root.querySelector<HTMLElement>(".protyle-background") || root;
          openTagViewerForBackground(bg);
        });

        firstIcon.before(button);
        firstIcon.before(tagButton);
      }

      if (!iconsContainer.querySelector(`[${FAVORITE_BUTTON_ATTR}]`)) {
        const favoriteButton = document.createElement("span");
        favoriteButton.className = "protyle-icon ariaLabel";
        favoriteButton.setAttribute(FAVORITE_BUTTON_ATTR, "true");
        favoriteButton.setAttribute("aria-label", "收藏当前题头图");
        favoriteButton.title = "收藏当前题头图（再次点击取消收藏）";
        setNativeSymbolIcon(favoriteButton, "iconStar");
        favoriteButton.addEventListener("click", (e: MouseEvent) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          const bg = root.querySelector<HTMLElement>(".protyle-background") || root;
          void actions.toggleCoverFavorite(root, bg, favoriteButton);
        });
        firstIcon.before(favoriteButton);
        const bg = root.querySelector<HTMLElement>(".protyle-background") || root;
        void actions.refreshFavoriteButton(root, bg, favoriteButton);
      }
    });
  };

  injectButtons();

  // 局部事件代理：仅当鼠标进入 header / background / title 区域时才检查是否需要补全按钮
  const handleHeaderMouse = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(".protyle-background, .protyle-top, .protyle-title")) {
      injectButtons();
    }
  };

  const backgroundEl = root.querySelector<HTMLElement>(".protyle-background");
  const topEl = root.querySelector<HTMLElement>(".protyle-top");
  const titleEl = root.querySelector<HTMLElement>(".protyle-title");

  backgroundEl?.addEventListener("mouseover", handleHeaderMouse, { passive: true });
  topEl?.addEventListener("mouseover", handleHeaderMouse, { passive: true });
  titleEl?.addEventListener("mouseover", handleHeaderMouse, { passive: true });

  const approvedNativeRemovals = new WeakSet<Element>();
  const handleNativeRemove = (event: MouseEvent) => {
    if (actions.getOptions().confirmRemoveCover === false) return;
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-type="remove"]')
      : null;
    if (!target || !backgroundEl?.contains(target)) return;
    if (approvedNativeRemovals.has(target)) {
      approvedNativeRemovals.delete(target);
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    confirm(
      actions.getOptions().t("lets-more-background.confirmRemoveCoverTitle"),
      actions.getOptions().t("lets-more-background.confirmRemoveCoverDescription"),
      () => {
        approvedNativeRemovals.add(target);
        target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      },
    );
  };

  backgroundEl?.addEventListener("click", handleNativeRemove, true);

  // 针对 background / top 的轻量级 MutationObserver（使用 rAF 节流，绝不 observe root 或 wysiwyg）
  let bgObserver: MutationObserver | null = null;
  let scheduledRaf = 0;
  const scheduleInject = () => {
    if (scheduledRaf) return;
    scheduledRaf = requestAnimationFrame(() => {
      scheduledRaf = 0;
      injectButtons();
    });
  };

  if (backgroundEl) {
    bgObserver = new MutationObserver(() => {
      scheduleInject();
    });
    bgObserver.observe(backgroundEl, {
      childList: true,
      subtree: true,
    });
  }

  return () => {
    if (scheduledRaf) cancelAnimationFrame(scheduledRaf);
    if (bgObserver) bgObserver.disconnect();
    backgroundEl?.removeEventListener("mouseover", handleHeaderMouse);
    topEl?.removeEventListener("mouseover", handleHeaderMouse);
    titleEl?.removeEventListener("mouseover", handleHeaderMouse);
    backgroundEl?.removeEventListener("click", handleNativeRemove, true);
    const injected = root.querySelectorAll(
      `[${BUTTON_ATTR}], [${FAVORITE_BUTTON_ATTR}], [data-damophus-more-background-title-btn]`,
    );
    injected.forEach((el) => el.remove());
  };
}
