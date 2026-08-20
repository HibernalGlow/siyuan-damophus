import { Menu, showMessage, openSetting } from "siyuan";
import { plugin } from "@/utils";
import { getLogger } from "@/libs/logger";
import {
  type CoverSourceItem,
  type SiteCredential,
  DEFAULT_COVER_SOURCES,
  formatCoverUrl,
  isVideoUrl,
  sanitizeAssetsPath,
} from "./sources";
import { isBooruSource, resolveBooruImageUrl } from "./booru";

const log = getLogger("lets-more-background");

export interface MoreBackgroundOptions {
  width: number;
  height: number;
  assetsLocation: string;
  readFromAssets: boolean;
  writeToAssets: boolean;
  siteCredentials?: SiteCredential[];
  booruLogin?: string;
  booruApiKey?: string;
  sources: CoverSourceItem[];
  t: (key: any) => string;
}

export interface MoreBackgroundHandle {
  scanRoot(root: HTMLElement): void;
  disposeRoot(root: HTMLElement): void;
  updateOptions(options: MoreBackgroundOptions): void;
  dispose(): void;
}

const BUTTON_ATTR = "data-damophus-more-background";

function generateTimestampId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

async function detectImageTypeAndName(blob: Blob): Promise<{ type: string; name: string }> {
  const buffer = await blob.slice(0, 4).arrayBuffer();
  const view = new Uint8Array(buffer);
  const hex = Array.from(view)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  switch (hex) {
    case "89504E47":
      return { type: "image/png", name: `${generateTimestampId()}.png` };
    case "FFD8FFDB":
    case "FFD8FFE0":
    case "FFD8FFE1":
    case "FFD8FFE2":
    case "FFD8FFE3":
      return { type: "image/jpeg", name: `${generateTimestampId()}.jpg` };
    case "47494638":
      return { type: "image/gif", name: `${generateTimestampId()}.gif` };
    case "52494646":
      return { type: "image/webp", name: `${generateTimestampId()}.webp` };
    case "3C737667":
      return { type: "image/svg+xml", name: `${generateTimestampId()}.svg` };
    case "0000000C":
      return { type: "image/avif", name: `${generateTimestampId()}.avif` };
    default:
      return { type: "image/png", name: `${generateTimestampId()}.png` };
  }
}

function triggerRandomIfNoImg(currentPage: HTMLElement): void {
  currentPage
    .querySelector(".protyle-background__img > img.fn__none")
    ?.classList.remove("fn__none");
  currentPage
    .querySelector(".protyle-background")
    ?.setAttribute("style", "min-height: 30vh;");
  currentPage
    .querySelector(
      '.protyle-background__img > .protyle-icons > span[data-type="position"]',
    )
    ?.classList.remove("fn__none");
}

export class MoreBackgroundController implements MoreBackgroundHandle {
  private options: MoreBackgroundOptions;
  private readonly rootCleanups = new Map<HTMLElement, () => void>();

  constructor(options: MoreBackgroundOptions) {
    this.options = options;
  }

  updateOptions(options: MoreBackgroundOptions): void {
    this.options = options;
  }

  scanRoot(root: HTMLElement): void {
    if (!root || !root.isConnected) return;
    this.disposeRoot(root);

    const cleanups: Array<() => void> = [];

    const background = root.querySelector<HTMLElement>(".protyle-background");
    if (background) {
      const bgCleanup = this.initBackground(root, background);
      cleanups.push(bgCleanup);
    }

    const wysiwyg = root.querySelector<HTMLElement>(".protyle-wysiwyg");
    if (wysiwyg) {
      const galleryCleanup = this.observeGalleryVideos(wysiwyg);
      cleanups.push(galleryCleanup);
    }

    this.rootCleanups.set(root, () => {
      for (const cleanup of cleanups) {
        try {
          cleanup();
        } catch (e) {
          log.warn("Error cleaning up root:", e);
        }
      }
    });
  }

  disposeRoot(root: HTMLElement): void {
    const cleanup = this.rootCleanups.get(root);
    if (cleanup) {
      cleanup();
      this.rootCleanups.delete(root);
    }
  }

  dispose(): void {
    for (const [, cleanup] of this.rootCleanups) {
      try {
        cleanup();
      } catch (e) {
        log.warn("Error during dispose:", e);
      }
    }
    this.rootCleanups.clear();
  }

  private initBackground(root: HTMLElement, background: HTMLElement): () => void {
    const img = background.querySelector<HTMLImageElement>("img");
    let videoObserver: MutationObserver | null = null;

    if (img) {
      const checkAndRenderVideo = () => {
        const src = img.getAttribute("src");
        if (src && isVideoUrl(src)) {
          this.renderVideoBackground(background, src);
        } else {
          this.removeVideoBackground(background);
        }
      };

      checkAndRenderVideo();

      videoObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "attributes" && mutation.attributeName === "src") {
            checkAndRenderVideo();
          }
        }
      });

      videoObserver.observe(img, {
        attributes: true,
        attributeFilter: ["src"],
      });
    }

    const injectTitleTagButton = () => {
      const tagsContainer =
        root.querySelector<HTMLElement>(".protyle-background__tags") ||
        background.querySelector<HTMLElement>(".protyle-background__tags");
      if (!tagsContainer || tagsContainer.querySelector("[data-damophus-more-background-title-btn]")) {
        return;
      }

      const bgTagBtn = tagsContainer.querySelector<HTMLElement>('span[data-type="background"]');
      const tagTagBtn = tagsContainer.querySelector<HTMLElement>('span[data-type="tag"]');
      const anchor = bgTagBtn || tagTagBtn;

      const titleButton = document.createElement("span");
      titleButton.className = "protyle-background__tag protyle-background__tag--text";
      titleButton.setAttribute("data-damophus-more-background-title-btn", "true");
      titleButton.setAttribute("data-type", "more-background");
      titleButton.innerHTML = `<svg class="svg"><use xlink:href="#iconImage"></use></svg>${this.options.t("lets-more-background.moreBackgroundBtn")}`;

      if (bgTagBtn) {
        bgTagBtn.after(titleButton);
      } else if (anchor) {
        anchor.after(titleButton);
      } else {
        tagsContainer.appendChild(titleButton);
      }

      titleButton.addEventListener("click", (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = titleButton.getBoundingClientRect();
        this.showBackgroundMenu(rect, root, background);
      });
    };

    injectTitleTagButton();

    const titleTagsObserver = new MutationObserver(() => {
      injectTitleTagButton();
    });

    titleTagsObserver.observe(root, {
      childList: true,
      subtree: true,
    });

    const handleMouseOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      injectTitleTagButton();
      const topEl = target.classList.contains("protyle-top")
        ? target
        : target.closest<HTMLElement>(".protyle-top");
      if (!topEl) return;

      const iconsContainer = topEl.querySelector<HTMLElement>(".protyle-icons");
      if (!iconsContainer || iconsContainer.querySelector(`[${BUTTON_ATTR}]`)) {
        return;
      }

      const firstIcon = iconsContainer.querySelector(".protyle-icon.ariaLabel");
      if (!firstIcon) return;

      const button = document.createElement("span");
      button.className = "protyle-icon ariaLabel";
      button.setAttribute(BUTTON_ATTR, "true");
      button.setAttribute("data-link", "more-background");
      button.setAttribute("aria-label", this.options.t("lets-more-background.moreBackgroundBtn"));
      button.innerHTML = '<svg><use xlink:href="#iconImage"></use></svg>';

      firstIcon.before(button);

      const onClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        this.showBackgroundMenu(rect, root, background);
      };

      button.addEventListener("click", onClick);
    };

    background.addEventListener("mouseover", handleMouseOver);

    return () => {
      background.removeEventListener("mouseover", handleMouseOver);
      titleTagsObserver.disconnect();
      if (videoObserver) {
        videoObserver.disconnect();
      }
      this.removeVideoBackground(background);
      const injectedButtons = root.querySelectorAll(`[${BUTTON_ATTR}], [data-damophus-more-background-title-btn]`);
      injectedButtons.forEach((b) => b.remove());
    };
  }

  private showBackgroundMenu(rect: DOMRect, root: HTMLElement, background: HTMLElement): void {
    const menu = new Menu("DamophusMoreBackground");
    const sources = this.options.sources?.length ? this.options.sources : DEFAULT_COVER_SOURCES;

    sources.forEach((item) => {
      if (!item.label && !item.url) return;
      menu.addItem({
        label: item.label || item.url,
        icon: "iconImage",
        click: () => this.applyRandomSource(item, root, background),
      });
    });

    menu.addSeparator();

    menu.addItem({
      label: this.options.t("lets-more-background.uploadFromClipboard"),
      icon: "iconCopy",
      click: () => this.applyFromClipboard(root, background),
    });

    if (this.options.readFromAssets) {
      menu.addItem({
        label: this.options.t("lets-more-background.loadFromAssets"),
        icon: "iconUpload",
        click: () => this.applyFromAssets(root, background),
      });
    }

    menu.addSeparator();

    menu.addItem({
      label: this.options.t("lets-more-background.openSetting"),
      icon: "iconSettings",
      click: () => {
        void openSetting(plugin);
      },
    });

    menu.open({ x: rect.left, y: rect.bottom, isLeft: false });
  }

  private async applyRandomSource(
    item: CoverSourceItem,
    root: HTMLElement,
    background: HTMLElement,
  ): Promise<void> {
    const url = formatCoverUrl(item.url, this.options.width, this.options.height);
    if (!url) return;

    triggerRandomIfNoImg(root);
    await this.fetchAndSetBackground(url, background);
  }

  private async applyFromClipboard(root: HTMLElement, background: HTMLElement): Promise<void> {
    try {
      if (!navigator.clipboard?.read) {
        showMessage(this.options.t("lets-more-background.noImageInClipboard"));
        return;
      }
      const clipboardItems = await navigator.clipboard.read();
      let imageBlob: Blob | null = null;

      for (const item of clipboardItems) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          imageBlob = await item.getType(imageType);
          break;
        }
      }

      if (!imageBlob) {
        showMessage(this.options.t("lets-more-background.noImageInClipboard"));
        return;
      }

      triggerRandomIfNoImg(root);
      await this.saveBlobAndSetBackground(imageBlob, background);
    } catch (e) {
      log.error("Failed to read clipboard:", e);
      showMessage(this.options.t("lets-more-background.noImageInClipboard"));
    }
  }

  private async applyFromAssets(root: HTMLElement, background: HTMLElement): Promise<void> {
    if (!this.options.readFromAssets) return;
    const location = sanitizeAssetsPath(this.options.assetsLocation);
    const files = await this.listImageFiles(location);

    if (!files || files.length === 0) {
      showMessage(this.options.t("lets-more-background.emptyAssets"));
      return;
    }

    const randomIndex = Math.floor(Math.random() * files.length);
    const chosenFile = files[randomIndex];
    triggerRandomIfNoImg(root);
    await this.setBlockBackgroundImage(background, chosenFile);
  }

  private async fetchAndSetBackground(url: string, background: HTMLElement): Promise<void> {
    background.style.cursor = "wait";
    try {
      let finalImageUrl = url;
      if (isBooruSource(url)) {
        const credentials = this.options.siteCredentials;
        const resolved = await resolveBooruImageUrl(url, credentials);
        if (!resolved) {
          showMessage(this.options.t("lets-more-background.loadUrlFailed"));
          return;
        }
        finalImageUrl = resolved;
      }

      if (this.options.writeToAssets) {
        const res = await fetch(finalImageUrl);
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const blob = await res.blob();
        await this.saveBlobAndSetBackground(blob, background);
      } else {
        // Direct remote or data URL
        await this.setBlockBackgroundImage(background, finalImageUrl);
      }
    } catch (e) {
      log.error("Failed to fetch image from URL:", url, e);
      showMessage(this.options.t("lets-more-background.loadUrlFailed"));
    } finally {
      background.style.cursor = "";
    }
  }

  private async saveBlobAndSetBackground(blob: Blob, background: HTMLElement): Promise<void> {
    background.style.cursor = "wait";
    try {
      if (this.options.writeToAssets) {
        const savedPath = await this.saveBlobToAssets(blob);
        if (savedPath) {
          await this.setBlockBackgroundImage(background, savedPath);
          return;
        }
      }

      const base64 = await this.blobToBase64(blob);
      await this.setBlockBackgroundImage(background, base64);
    } catch (e) {
      log.error("Failed to save/set blob background:", e);
      showMessage(this.options.t("lets-more-background.loadUrlFailed"));
    } finally {
      background.style.cursor = "";
    }
  }

  private async saveBlobToAssets(blob: Blob): Promise<string | null> {
    try {
      const { type, name } = await detectImageTypeAndName(blob);
      const file = new File([blob], name, { type });
      const location = sanitizeAssetsPath(this.options.assetsLocation);
      const filePath = `/data${location}/${name}`;

      const formData = new FormData();
      formData.append("path", filePath);
      formData.append("isDir", "false");
      formData.append("file", file);

      const res = await fetch("/api/file/putFile", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.code !== 0) {
        showMessage(this.options.t("lets-more-background.writeImgToAssetsFailed"));
        return null;
      }
      return `${location}/${name}`.replace(/^\/+/, "");
    } catch (e) {
      log.error("Failed to save image to assets:", e);
      showMessage(this.options.t("lets-more-background.writeImgToAssetsFailed"));
      return null;
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.onabort = reject;
      reader.readAsDataURL(blob);
    });
  }

  private async setBlockBackgroundImage(background: HTMLElement, urlOrPath: string): Promise<void> {
    const blockId = background.getAttribute("data-node-id");
    if (!blockId) {
      log.warn("Cannot find block data-node-id on background element");
      return;
    }

    let finalVal = urlOrPath.trim();
    if (!finalVal.startsWith("data:") && !finalVal.startsWith("http://") && !finalVal.startsWith("https://")) {
      finalVal = finalVal.replace(/^\/+/, "");
    }

    await fetch("/api/attr/setBlockAttrs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: blockId,
        attrs: {
          "title-img": `background-image:url("${finalVal}")`,
        },
      }),
    });
  }

  private async listImageFiles(path: string): Promise<string[] | null> {
    try {
      const res = await fetch("/api/file/readDir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: `/data${path}`,
        }),
      });
      const data = await res.json();
      if (data.code !== 0 || !Array.isArray(data.data)) {
        return null;
      }
      const imageFileRegex = /\.(jpe?g|png|gif|bmp|webp|svg|avif)$/i;
      const results: string[] = [];
      for (const item of data.data) {
        if (item.name && imageFileRegex.test(item.name)) {
          results.push(`${path}/${item.name}`.replace(/^\/+/, ""));
        }
      }
      return results;
    } catch (e) {
      log.error("Failed to list assets directory:", path, e);
      showMessage(`${this.options.t("lets-more-background.readAssetsError")}: ${path}`);
      return null;
    }
  }

  private renderVideoBackground(background: HTMLElement, url: string): void {
    const container = background.querySelector<HTMLElement>(".protyle-background__img");
    if (!container) return;

    this.removeVideoBackground(background);
    const img = container.querySelector<HTMLImageElement>("img");

    const video = document.createElement("video");
    video.currentTime = 0;
    video.muted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.src = url;
    video.setAttribute("data-playing", "true");
    video.className = "protyle-background__video";
    video.setAttribute(
      "style",
      "position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; pointer-events: auto;",
    );

    if (img && img.style.objectPosition) {
      video.style.objectPosition = img.style.objectPosition;
    }

    container.appendChild(video);

    // Support dragging to adjust vertical position
    video.addEventListener("mousedown", (event: MouseEvent) => {
      event.preventDefault();
      const icons = video.parentElement?.querySelector(".protyle-icons");
      if (icons && !icons.classList.contains("fn__none")) {
        return;
      }
      const startY = event.clientY;
      const height = (video.videoHeight * video.clientWidth) / (video.videoWidth || 1) - video.clientHeight;
      let originalPositionY = parseFloat(video.style.objectPosition.substring(7)) || 50;
      if (video.style.objectPosition.endsWith("px")) {
        originalPositionY = (-parseInt(video.style.objectPosition.substring(7), 10) / (height || 1)) * 100;
      }

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = height ? ((startY - moveEvent.clientY) / height) * 100 + originalPositionY : 50;
        const clampedDelta = Math.max(0, Math.min(100, delta)).toFixed(2);
        video.style.objectPosition = `center ${clampedDelta}%`;
        if (img) {
          img.style.objectPosition = `center ${clampedDelta}%`;
        }
        moveEvent.preventDefault();
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  }

  private removeVideoBackground(background: HTMLElement): void {
    const video = background.querySelector(".protyle-background__video");
    if (video) {
      video.remove();
    }
  }

  private observeGalleryVideos(wysiwyg: HTMLElement): () => void {
    const replaceImgWithVideo = (img: HTMLImageElement) => {
      const src = img.src || img.getAttribute("src") || "";
      if (!isVideoUrl(src)) return;
      if (img.parentElement?.querySelector("video.damophus-gallery-video")) return;

      const video = document.createElement("video");
      video.src = src;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.className = "damophus-gallery-video";
      video.setAttribute(
        "style",
        img.getAttribute("style") || "width: 100%; height: 100%; object-fit: cover;",
      );

      video.addEventListener("click", (e) => {
        e.stopPropagation();
        if (video.paused) {
          video.play().catch((err) => log.warn("Video playback prevented:", err));
        } else {
          video.pause();
        }
      });

      img.replaceWith(video);
    };

    const imgs = wysiwyg.querySelectorAll<HTMLImageElement>("img");
    imgs.forEach(replaceImgWithVideo);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              if (node instanceof HTMLImageElement) {
                replaceImgWithVideo(node);
              }
              const childImgs = node.querySelectorAll<HTMLImageElement>("img");
              childImgs.forEach(replaceImgWithVideo);
            }
          });
        }
      }
    });

    observer.observe(wysiwyg, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      const videos = wysiwyg.querySelectorAll<HTMLVideoElement>("video.damophus-gallery-video");
      videos.forEach((v) => v.remove());
    };
  }
}

export function startMoreBackground(options: MoreBackgroundOptions): MoreBackgroundHandle {
  return new MoreBackgroundController(options);
}
