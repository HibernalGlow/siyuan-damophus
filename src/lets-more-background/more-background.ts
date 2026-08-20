import { Menu, showMessage, openSetting } from "siyuan";
import { plugin } from "@/utils";
import { getLogger } from "@/libs/logger";
import {
  type CoverSourceItem,
  DEFAULT_COVER_SOURCES,
  formatCoverUrl,
  isVideoUrl,
  sanitizeAssetsPath,
  type SiteCredential,
} from "./sources";
import { isBooruSource, resolveBooruImageUrl } from "./booru";

const log = getLogger("lets-more-background");
const BUTTON_ATTR = "data-damophus-more-background";

export interface MoreBackgroundOptions {
  width: number;
  height: number;
  assetsLocation: string;
  readFromAssets: boolean;
  writeToAssets: boolean;
  siteCredentials?: SiteCredential[];
  sources?: CoverSourceItem[];
  t: (key: string) => string;
}

export interface MoreBackgroundHandle {
  scanRoot(root: HTMLElement): void;
  disposeRoot(root: HTMLElement): void;
  dispose(): void;
  updateOptions(options: MoreBackgroundOptions): void;
}

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

    // 1. 初始化标题栏与题头图控制按钮
    const coverControlsCleanup = this.initTitleCoverControls(root);
    cleanups.push(coverControlsCleanup);

    // 2. 初始化视频背景支持
    const background = root.querySelector<HTMLElement>(".protyle-background");
    if (background) {
      const bgCleanup = this.initVideoBackground(background);
      cleanups.push(bgCleanup);
    }

    // 3. 画廊视频观察器
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

  private initTitleCoverControls(root: HTMLElement): () => void {
    const injectButtons = () => {
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
          container.lastElementChild as HTMLElement;

        if (isButtonType) {
          const btn = document.createElement("button");
          btn.className = "b3-button b3-button--cancel";
          btn.setAttribute("data-damophus-more-background-title-btn", "true");
          btn.setAttribute("data-type", "more-background-random");
          btn.innerHTML = `<svg><use xlink:href="#iconImage"></use></svg>${this.options.t("lets-more-background.moreBackgroundBtn")}`;

          if (randomBtn) {
            randomBtn.after(btn);
          } else {
            container.appendChild(btn);
          }

          btn.addEventListener("click", (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = btn.getBoundingClientRect();
            const bg = root.querySelector<HTMLElement>(".protyle-background") || root;
            this.showBackgroundMenu(rect, root, bg);
          });
        } else {
          const span = document.createElement("span");
          span.className = "protyle-background__tag protyle-background__tag--text";
          span.setAttribute("data-damophus-more-background-title-btn", "true");
          span.setAttribute("data-type", "more-background-random");
          span.style.cursor = "pointer";
          span.innerHTML = `<svg class="svg"><use xlink:href="#iconImage"></use></svg><span>${this.options.t("lets-more-background.moreBackgroundBtn")}</span>`;

          if (randomBtn) {
            randomBtn.after(span);
          } else {
            container.appendChild(span);
          }

          span.addEventListener("click", (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = span.getBoundingClientRect();
            const bg = root.querySelector<HTMLElement>(".protyle-background") || root;
            this.showBackgroundMenu(rect, root, bg);
          });
        }
      });

      // 1.2 兜底查找独立的 button[data-type="random"] 或 span[data-type="random"]
      const standaloneRandomBtns = root.querySelectorAll<HTMLElement>(
        'button[data-type="random"], button[data-type="background"], span[data-type="background"]',
      );
      standaloneRandomBtns.forEach((anchor) => {
        const parent = anchor.parentElement;
        if (!parent || parent.querySelector("[data-damophus-more-background-title-btn]")) return;

        const isButton = anchor.tagName.toLowerCase() === "button";
        const newEl = document.createElement(isButton ? "button" : "span");
        newEl.className = anchor.className;
        newEl.setAttribute("data-damophus-more-background-title-btn", "true");
        newEl.setAttribute("data-type", "more-background-random");
        if (!isButton) newEl.style.cursor = "pointer";
        newEl.innerHTML = `<svg${isButton ? "" : ' class="svg"'}><use xlink:href="#iconImage"></use></svg>${isButton ? "" : "<span>"}${this.options.t("lets-more-background.moreBackgroundBtn")}${isButton ? "" : "</span>"}`;

        anchor.after(newEl);

        newEl.addEventListener("click", (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          const rect = newEl.getBoundingClientRect();
          const bg = root.querySelector<HTMLElement>(".protyle-background") || root;
          this.showBackgroundMenu(rect, root, bg);
        });
      });

      // 2. 已有题头图时：注入右上角操作条中的随机图源按钮 (.protyle-icons)
      const topIcons = root.querySelectorAll<HTMLElement>(
        ".protyle-top .protyle-icons, .protyle-background .protyle-icons, .protyle-background__img .protyle-icons",
      );
      topIcons.forEach((iconsContainer) => {
        if (iconsContainer.querySelector(`[${BUTTON_ATTR}]`)) return;
        const firstIcon =
          iconsContainer.querySelector(".protyle-icon.ariaLabel") || iconsContainer.firstElementChild;
        if (!firstIcon) return;

        const button = document.createElement("span");
        button.className = "protyle-icon ariaLabel";
        button.setAttribute(BUTTON_ATTR, "true");
        button.setAttribute("data-link", "more-background");
        button.setAttribute("aria-label", this.options.t("lets-more-background.moreBackgroundBtn"));
        button.innerHTML = '<svg><use xlink:href="#iconImage"></use></svg>';

        firstIcon.before(button);

        button.addEventListener("click", (e: MouseEvent) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const bg = root.querySelector<HTMLElement>(".protyle-background") || root;
          this.showBackgroundMenu(rect, root, bg);
        });
      });
    };

    injectButtons();

    const observer = new MutationObserver(() => {
      injectButtons();
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
    });

    const handleMouse = () => {
      injectButtons();
    };

    root.addEventListener("mouseover", handleMouse, { passive: true });
    root.addEventListener("mouseenter", handleMouse, { passive: true });

    return () => {
      observer.disconnect();
      root.removeEventListener("mouseover", handleMouse);
      root.removeEventListener("mouseenter", handleMouse);
      const injected = root.querySelectorAll(
        `[${BUTTON_ATTR}], [data-damophus-more-background-title-btn]`,
      );
      injected.forEach((el) => el.remove());
    };
  }

  private initVideoBackground(background: HTMLElement): () => void {
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

    return () => {
      if (videoObserver) {
        videoObserver.disconnect();
      }
      this.removeVideoBackground(background);
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
    const { name } = await detectImageTypeAndName(blob);
    const location = sanitizeAssetsPath(this.options.assetsLocation);

    const assetPath = await this.uploadToAssets(blob, name, location);
    if (assetPath) {
      await this.setBlockBackgroundImage(background, assetPath);
    } else {
      const base64 = await this.blobToBase64(blob);
      await this.setBlockBackgroundImage(background, base64);
    }
  }

  private async uploadToAssets(blob: Blob, name: string, location: string): Promise<string | null> {
    try {
      const formData = new FormData();
      formData.append("path", `/data${location}/${name}`);
      formData.append("file", blob, name);
      formData.append("isDir", "false");

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
    const blockId =
      background.getAttribute("data-node-id") ||
      background.closest(".protyle")?.querySelector<HTMLElement>(".protyle-title")?.getAttribute("data-node-id") ||
      background.closest(".protyle")?.querySelector<HTMLElement>("[data-node-id]")?.getAttribute("data-node-id");

    if (!blockId) {
      log.warn("Cannot find block data-node-id on background or protyle element");
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
    if (img) {
      img.classList.add("fn__none");
    }

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
          void video.play();
        } else {
          video.pause();
        }
      });

      img.before(video);
      img.classList.add("fn__none");
    };

    const scanAll = () => {
      const images = wysiwyg.querySelectorAll<HTMLImageElement>("img");
      images.forEach(replaceImgWithVideo);
    };

    scanAll();

    const observer = new MutationObserver(() => {
      scanAll();
    });

    observer.observe(wysiwyg, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      const videos = wysiwyg.querySelectorAll("video.damophus-gallery-video");
      videos.forEach((v) => v.remove());
      const hiddenImages = wysiwyg.querySelectorAll("img.fn__none");
      hiddenImages.forEach((img) => img.classList.remove("fn__none"));
    };
  }
}

export function startMoreBackground(options: MoreBackgroundOptions): MoreBackgroundHandle {
  return new MoreBackgroundController(options);
}
