import { isVideoUrl } from "./sources";

export function removeVideoBackground(background: HTMLElement): void {
  const video = background.querySelector(".protyle-background__video");
  if (video) {
    video.remove();
  }
}

export function renderVideoBackground(background: HTMLElement, url: string): void {
  const container = background.querySelector<HTMLElement>(".protyle-background__img");
  if (!container) return;

  removeVideoBackground(background);

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
}

/** Watches the title image for a video URL and swaps in a looping <video>. */
export function initVideoBackground(background: HTMLElement): () => void {
  const img = background.querySelector<HTMLImageElement>("img");
  let videoObserver: MutationObserver | null = null;

  if (img) {
    const checkAndRenderVideo = () => {
      const src = img.getAttribute("src");
      if (src && isVideoUrl(src)) {
        renderVideoBackground(background, src);
      } else {
        removeVideoBackground(background);
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
    removeVideoBackground(background);
  };
}

/** Replaces gallery images pointing at video URLs with inline looping videos. */
export function observeGalleryVideos(wysiwyg: HTMLElement): () => void {
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

  // 初始扫描仅执行一次
  const images = wysiwyg.querySelectorAll<HTMLImageElement>("img");
  images.forEach(replaceImgWithVideo);

  // 仅监听新增节点，避免每次 DOM 变化进行全量 querySelectorAll
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.tagName === "IMG") {
              replaceImgWithVideo(el as HTMLImageElement);
            } else if (el.querySelectorAll) {
              const imgs = el.querySelectorAll<HTMLImageElement>("img");
              imgs.forEach(replaceImgWithVideo);
            }
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
    const videos = wysiwyg.querySelectorAll("video.damophus-gallery-video");
    videos.forEach((v) => v.remove());
    const hiddenImages = wysiwyg.querySelectorAll("img.fn__none");
    hiddenImages.forEach((img) => img.classList.remove("fn__none"));
  };
}
