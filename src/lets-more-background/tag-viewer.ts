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
