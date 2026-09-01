import { mount, unmount } from "svelte";
import { Dialog } from "siyuan";
import { isMobile } from "@/utils";
import CoverTagViewerModal from "./CoverTagViewerModal.svelte";
import CoverHoverTagOverlay from "./CoverHoverTagOverlay.svelte";

export interface CoverTagViewerMeta {
  site?: string;
  postId?: string | number;
  postUrl?: string;
  tags?: string[] | string;
  width?: number | string;
  height?: number | string;
  score?: number | string;
}

export function openCoverTagViewer(meta: CoverTagViewerMeta): void {
  let app: any = null;
  const dialog = new Dialog({
    title: "🏷️ 题头图 Tag 标签清单与中文对照",
    content: '<div class="damophus-tag-viewer-host" style="width: 100%; height: 100%;"></div>',
    width: isMobile ? "100vw" : "min(92vw, 760px)",
    height: isMobile ? "100dvh" : "min(85dvh, 660px)",
    destroyCallback: () => {
      if (app) void unmount(app);
    },
  });

  const target = dialog.element.querySelector<HTMLElement>(".damophus-tag-viewer-host");
  if (!target) {
    dialog.destroy();
    return;
  }

  app = mount(CoverTagViewerModal, {
    target,
    props: {
      ...meta,
      onclose: () => dialog.destroy(),
    },
  });
}

export function mountCoverHoverOverlay(target: HTMLElement, meta: CoverTagViewerMeta): () => void {
  if (!target.isConnected) return () => {};
  const app = mount(CoverHoverTagOverlay, {
    target,
    props: meta as any,
  });

  return () => {
    try {
      void unmount(app);
    } catch {}
  };
}

function collectBackgroundTagMeta(background: HTMLElement): CoverTagViewerMeta {
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
  return {
    site: currentPostSite,
    postId: currentPostId,
    postUrl: currentPostUrl,
    tags: currentPostTags,
    score: currentScore,
    width: currentDimensions ? currentDimensions.split("×")[0]?.trim() : "",
    height: currentDimensions ? currentDimensions.split("×")[1]?.trim() : "",
  };
}

/** Opens the tag viewer modal for the cover currently set on a background. */
export function openTagViewerForBackground(background: HTMLElement): void {
  openCoverTagViewer(collectBackgroundTagMeta(background));
}

/**
 * Mounts the hover tag overlay host next to the document tags and keeps it in
 * sync with the background's post metadata attributes. Falls back to reading
 * block attrs once when the live attributes are missing.
 */
export function initCoverTagOverlay(root: HTMLElement): () => void {
  const background = root.querySelector<HTMLElement>(".protyle-background") || root;
  const topContainer = root.querySelector<HTMLElement>(".protyle-top") || root;
  const actionContainer =
    root.querySelector<HTMLElement>(".protyle-background__tags") ||
    root.querySelector<HTMLElement>(".protyle-background__action") ||
    topContainer;

  let overlayHost = actionContainer.querySelector<HTMLElement>(".damophus-cover-tag-overlay-host");
  if (!overlayHost) {
    overlayHost = document.createElement("div");
    overlayHost.className = "damophus-cover-tag-overlay-host";
    overlayHost.style.display = "inline-flex";
    overlayHost.style.alignItems = "center";
    overlayHost.style.verticalAlign = "middle";
    overlayHost.style.flexWrap = "wrap";
    overlayHost.style.gap = "6px";
    overlayHost.style.marginLeft = "4px";
    actionContainer.appendChild(overlayHost);
  }

  let unmountOverlay: (() => void) | null = null;

  const updateOverlay = () => {
    if (!root.isConnected) return;
    let rawTags =
      background.getAttribute("data-damophus-post-tags") ||
      background.querySelector("img")?.getAttribute("data-damophus-post-tags") ||
      root.getAttribute("data-damophus-post-tags") ||
      "";

    let site = background.getAttribute("data-damophus-post-site") || root.getAttribute("data-damophus-post-site") || "";
    let postId = background.getAttribute("data-damophus-post-id") || root.getAttribute("data-damophus-post-id") || "";
    let postUrl =
      background.getAttribute("data-damophus-post-url") ||
      background.querySelector("img")?.getAttribute("data-damophus-post-url") ||
      root.getAttribute("data-damophus-post-url") ||
      "";
    let score = background.getAttribute("data-damophus-post-score") || root.getAttribute("data-damophus-post-score") || "";
    let dimensions = background.getAttribute("data-damophus-post-dimensions") || root.getAttribute("data-damophus-post-dimensions") || "";

    if (!rawTags) {
      const blockId =
        background.getAttribute("data-node-id") ||
        root.querySelector<HTMLElement>(".protyle-title")?.getAttribute("data-node-id") ||
        root.querySelector<HTMLElement>("[data-node-id]")?.getAttribute("data-node-id");

      if (blockId && !background.hasAttribute("data-damophus-checked-attrs")) {
        background.setAttribute("data-damophus-checked-attrs", "true");
        void fetch("/api/attr/getBlockAttrs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: blockId }),
        })
          .then((r) => r.json())
          .then((res) => {
            if (res.code === 0 && res.data && res.data["custom-damophus-post-tags"]) {
              const attrs = res.data;
              background.setAttribute("data-damophus-post-tags", attrs["custom-damophus-post-tags"]);
              if (attrs["custom-damophus-post-site"]) background.setAttribute("data-damophus-post-site", attrs["custom-damophus-post-site"]);
              if (attrs["custom-damophus-post-id"]) background.setAttribute("data-damophus-post-id", attrs["custom-damophus-post-id"]);
              if (attrs["custom-damophus-post-url"]) background.setAttribute("data-damophus-post-url", attrs["custom-damophus-post-url"]);
              if (attrs["custom-damophus-post-score"]) background.setAttribute("data-damophus-post-score", attrs["custom-damophus-post-score"]);
              if (attrs["custom-damophus-post-dimensions"]) background.setAttribute("data-damophus-post-dimensions", attrs["custom-damophus-post-dimensions"]);
              updateOverlay();
            }
          })
          .catch(() => {});
      }

      if (unmountOverlay) {
        unmountOverlay();
        unmountOverlay = null;
      }
      return;
    }

    if (unmountOverlay) {
      unmountOverlay();
      unmountOverlay = null;
    }

    unmountOverlay = mountCoverHoverOverlay(overlayHost!, {
      tags: rawTags,
      site,
      postId,
      postUrl,
      score,
      width: dimensions ? dimensions.split("×")[0]?.trim() : "",
      height: dimensions ? dimensions.split("×")[1]?.trim() : "",
    });
  };

  updateOverlay();

  const observer = new MutationObserver(() => updateOverlay());
  observer.observe(background, {
    attributes: true,
    attributeFilter: ["data-damophus-post-tags", "data-damophus-post-url", "data-damophus-post-site"],
  });

  return () => {
    observer.disconnect();
    if (unmountOverlay) {
      unmountOverlay();
      unmountOverlay = null;
    }
    overlayHost?.remove();
  };
}
