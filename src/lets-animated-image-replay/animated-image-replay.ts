// Ported from the already validated InkLoom browser player; runtime DOM types are intentionally local.
// @ts-nocheck

export interface AnimatedImageReplayOptions {
  showReplayButton?: boolean;
  replayOnHover?: boolean;
  replayLabel?: string;
  hoverReplayDelayMs?: number;
  focusReturnGuardMs?: number;
  fallbackReplayDurationMs?: number;
  playbackEndGuardMs?: number;
  replayBlobCacheSize?: number;
  replayWhenOpenedLarge?: boolean;
  scanDocument?: boolean;
  initialFrame?: "first" | "last";
}

export interface AnimatedImageReplayHandle {
  dispose(): void;
  scanRoot(root: Node): void;
  disposeRoot(root: Node): void;
}

interface LegacyAnimatedImageReplayHandle {
  dispose(): void;
}

declare global {
  interface Window {
    __inkloomAnimatedImagePlayer?: LegacyAnimatedImageReplayHandle;
    __damophusAnimatedStillFrames?: Map<string, HTMLCanvasElement>;
  }
}

export const startAnimatedImageReplay = ({
  showReplayButton = true,
  replayOnHover = true,
  replayLabel = "Replay image",
  hoverReplayDelayMs = 700,
  focusReturnGuardMs = 1000,
  fallbackReplayDurationMs = 20000,
  playbackEndGuardMs = 500,
  replayBlobCacheSize = 4,
  replayWhenOpenedLarge = true,
  scanDocument = true,
  initialFrame = "last",
}: AnimatedImageReplayOptions = {}): AnimatedImageReplayHandle => {
  window.__inkloomAnimatedImagePlayer?.dispose?.();

  // APNG only matches .apng by default, so ordinary PNG images are not scanned.
  // data-damophus-animated-type also supports extensionless image sources.
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value) || minimum));
  const CONFIG = {
    imageTypes: [
      {name: 'WebP', extensions: ['webp'], mimeType: 'image/webp'},
      {name: 'GIF', extensions: ['gif'], mimeType: 'image/gif'},
      {name: 'AVIF', extensions: ['avif'], mimeType: 'image/avif'},
      {name: 'APNG', extensions: ['apng'], mimeType: 'image/png'},
    ],
    showReplayButton, // Show the small replay control.
    replayOnHover, // Replay when the pointer enters the image.
    hoverReplayDelayMs: clamp(hoverReplayDelayMs, 100, 5000), // Require an intentional hover before replaying.
    focusReturnGuardMs: clamp(focusReturnGuardMs, 0, 5000), // Defer hover replay briefly after returning to SiYuan.
    fallbackReplayDurationMs: clamp(fallbackReplayDurationMs, 1000, 120000), // Used when a scene manifest is unavailable.
    playbackEndGuardMs: clamp(playbackEndGuardMs, 0, 5000), // Allow for image decode before releasing the replay lock.
    replayBlobCacheSize: Math.round(clamp(replayBlobCacheSize, 1, 16)), // Bound decoded replay media retained during a SiYuan session.
    replayWhenOpenedLarge: replayWhenOpenedLarge !== false, // Replay when SiYuan opens the large-image viewer.
    initialFrame: initialFrame === "first" ? "first" : "last",
  };

  const LEGACY_WRAPPER_CLASS = 'inkloom-animated-image-player';
  const LEGACY_OVERLAY_CLASS = 'inkloom-animated-image-overlay';
  const LEGACY_STYLE_ID = 'inkloom-animated-image-player-styles';
  const OVERLAY_CLASS = 'damophus-animated-image-overlay';
  const STYLE_ID = 'damophus-animated-image-replay-styles';
  const PLAYER_STATE_KEY = 'damophusAnimatedImageReplay';
  const LARGE_VIEW_ROOT_SELECTOR = '.viewer-container, .viewer-canvas, .b3-dialog, [role="dialog"]';
  const LARGE_VIEW_IMAGE_SELECTOR = '.viewer-container img, .viewer-canvas img, .b3-dialog img, [role="dialog"] img';
  const controllersByImage = new WeakMap();
  const replayStatesByImage = new WeakMap();
  const replayBlobPromisesBySource = new Map();
  const replayDurationPromisesBySource = new Map();
  const stillFramesBySource = window.__damophusAnimatedStillFrames ??= new Map();
  const stillFrameCacheLimit = Math.max(4, CONFIG.replayBlobCacheSize * 2);
  const replayedImages = new Set();
  const activeControllers = new Set();
  let activeReplayImage = null;
  let hoverReplayBlockedUntil = 0;
  let disposed = false;
  let overlaySyncFrame = 0;
  let scanFrame = 0;
  let largeViewReplayTimer = 0;

  const cleanupLegacyPlayers = () => {
    document.querySelectorAll(`.${LEGACY_WRAPPER_CLASS}`).forEach((wrapper) => {
      const img = [...wrapper.children].find((child) => child instanceof HTMLImageElement);
      if (!(img instanceof HTMLImageElement) || !wrapper.parentNode) {
        wrapper.remove();
        return;
      }

      // The retired Canvas player hid and reparented the original image.
      // Mark it before moving so the legacy observer cannot wrap it again.
      img.dataset[PLAYER_STATE_KEY] = 'migrating';
      img.hidden = false;
      wrapper.parentNode.insertBefore(img, wrapper);
      wrapper.remove();
    });

    document.querySelectorAll(`.${OVERLAY_CLASS}, .${LEGACY_OVERLAY_CLASS}`)
      .forEach((overlay) => overlay.remove());
    document.getElementById(LEGACY_STYLE_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
  };

  const normalizedUrl = (value) => {
    try {
      const url = new URL(value, window.location.href);
      url.hash = '';
      return url.href;
    } catch {
      return value;
    }
  };

  const extensionFromUrl = (value) => {
    try {
      const pathname = new URL(value, window.location.href).pathname.toLowerCase();
      return pathname.split('.').pop() || '';
    } catch {
      return '';
    }
  };

  const findImageType = (img, src) => {
    const explicitType = (
      img.dataset.damophusAnimatedType
      ?? img.dataset.inkloomAnimatedType
    )?.toLowerCase();
    if (explicitType) {
      return CONFIG.imageTypes.find((type) => type.name.toLowerCase() === explicitType);
    }

    const extension = extensionFromUrl(src);
    return CONFIG.imageTypes.find((type) => type.extensions.includes(extension));
  };

  const sourceForImage = (img) => (
    img.dataset.damophusAnimatedSrc
    ?? img.dataset.inkloomAnimatedSrc
    ?? img.getAttribute('src')
    ?? img.currentSrc
    ?? img.src
    ?? ''
  );

  const installStyles = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${OVERLAY_CLASS} {
        position: absolute;
        display: block;
        overflow: hidden;
        margin: 0;
        padding: 0;
        pointer-events: none;
        line-height: 0;
        z-index: 4;
      }
      .${OVERLAY_CLASS}__controls {
        position: absolute;
        right: 4px;
        bottom: 4px;
        display: flex;
        z-index: 3;
        visibility: visible;
        pointer-events: auto;
        isolation: isolate;
      }
      .${OVERLAY_CLASS}__still {
        position: absolute;
        inset: 0;
        z-index: 1;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }
      .${OVERLAY_CLASS}__replay {
        position: absolute;
        inset: 0;
        z-index: 2;
        display: block;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }
      .${OVERLAY_CLASS}__replay[hidden] {
        display: none;
      }
      .${OVERLAY_CLASS}__still[hidden] {
        display: none;
      }
      .${OVERLAY_CLASS}__controls[hidden] {
        display: none;
      }
      .${OVERLAY_CLASS}__controls button {
        display: grid;
        position: relative;
        z-index: 1;
        width: 30px;
        height: 30px;
        place-items: center;
        margin: 0;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: transparent;
        color: rgba(255, 255, 255, 0.78);
        cursor: pointer;
        font: 600 16px/1 system-ui, sans-serif;
        opacity: 0.78;
        outline: none;
        isolation: isolate;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
        transition: color 120ms ease, opacity 120ms ease;
      }
      .${OVERLAY_CLASS}__controls button::before {
        content: '';
        position: absolute;
        inset: 0;
        z-index: -1;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 50%;
        background: rgba(18, 24, 22, 0.3);
        backdrop-filter: blur(3px);
        transition: background 120ms ease;
      }
      .${OVERLAY_CLASS}__controls button:hover,
      .${OVERLAY_CLASS}__controls button:focus-visible {
        opacity: 0.92;
      }
      .${OVERLAY_CLASS}__controls button:hover::before,
      .${OVERLAY_CLASS}__controls button:focus-visible::before {
        background: rgba(18, 24, 22, 0.56);
      }
      .${OVERLAY_CLASS}__controls button:focus-visible::before {
        box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.58);
      }
      .${OVERLAY_CLASS}__controls button svg {
        width: 16px;
        height: 16px;
        fill: currentColor;
      }
      @media (max-width: 600px), (pointer: coarse) {
        .${OVERLAY_CLASS}__controls {
          right: 0;
          bottom: 0;
        }
        .${OVERLAY_CLASS}__controls button {
          width: 44px;
          height: 44px;
          font-size: 14px;
        }
        .${OVERLAY_CLASS}__controls button::before {
          inset: auto;
          left: 50%;
          top: 50%;
          width: 26px;
          height: 26px;
          transform: translate(-50%, -50%);
        }
      }
    `;
    document.head.appendChild(style);
  };

  const createButton = (label, title) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.title = title;
    return button;
  };

  const createReplayControl = ({label = replayLabel} = {}) => {
    const controls = document.createElement('span');
    controls.className = `${OVERLAY_CLASS}__controls`;
    const replayButton = CONFIG.showReplayButton
      ? createButton(label, label)
      : null;
    if (replayButton) {
      replayButton.innerHTML = '<svg aria-hidden="true"><use xlink:href="#iconRefresh"></use></svg>';
      controls.appendChild(replayButton);
    }
    return {controls, replayButton};
  };

  const replayDurationForSource = (source) => {
    const key = normalizedUrl(source);
    let durationPromise = replayDurationPromisesBySource.get(key);
    if (durationPromise) return durationPromise;

    durationPromise = (async () => {
      try {
        const sourceUrl = new URL(source, window.location.href);
        if (!sourceUrl.pathname.includes('/animation-avif/')) {
          return {durationMs: CONFIG.fallbackReplayDurationMs, frameDurationMs: 1000 / 30};
        }
        const file = sourceUrl.pathname.split('/').pop();
        sourceUrl.pathname = `${sourceUrl.pathname.slice(0, sourceUrl.pathname.lastIndexOf('/') + 1)}manifest.json`;
        sourceUrl.search = '';
        sourceUrl.hash = '';
        const response = await fetch(sourceUrl, {cache: 'force-cache'});
        if (!response.ok) return {durationMs: CONFIG.fallbackReplayDurationMs, frameDurationMs: 1000 / 30};
        const manifest = await response.json();
        const scene = manifest.scenes?.find((candidate) => candidate.file === file);
        const durationMs = Number.isFinite(scene?.durationMs) && scene.durationMs > 0
          ? scene.durationMs
          : CONFIG.fallbackReplayDurationMs;
        const frameDurationMs = Number.isFinite(manifest.targetFps) && manifest.targetFps > 0
          ? 1000 / manifest.targetFps
          : Number.isFinite(scene?.frameCount) && scene.frameCount > 0
            ? durationMs / scene.frameCount
            : 1000 / 30;
        return {durationMs, frameDurationMs};
      } catch {
        return {durationMs: CONFIG.fallbackReplayDurationMs, frameDurationMs: 1000 / 30};
      }
    })();
    replayDurationPromisesBySource.set(key, durationPromise);
    return durationPromise;
  };

  const tailCaptureDelay = ({durationMs, frameDurationMs}, elapsedMs = 0) => (
    Math.max(0, durationMs - Math.max(8, frameDurationMs / 2) - elapsedMs)
  );

  const hasManifestDurationSource = (source) => {
    try {
      return new URL(source, window.location.href).pathname.includes('/animation-avif/');
    } catch {
      return false;
    }
  };

  const replayBlobForSource = (source) => {
    const key = normalizedUrl(source);
    let blobPromise = replayBlobPromisesBySource.get(key);
    if (blobPromise) {
      replayBlobPromisesBySource.delete(key);
      replayBlobPromisesBySource.set(key, blobPromise);
      return blobPromise;
    }

    blobPromise = fetch(source, {cache: 'force-cache'})
      .then((response) => {
        if (!response.ok) throw new Error(`request failed with ${response.status}`);
        return response.blob();
      })
      .catch((error) => {
        replayBlobPromisesBySource.delete(key);
        throw error;
      });
    while (replayBlobPromisesBySource.size >= CONFIG.replayBlobCacheSize) {
      replayBlobPromisesBySource.delete(replayBlobPromisesBySource.keys().next().value);
    }
    replayBlobPromisesBySource.set(key, blobPromise);
    return blobPromise;
  };

  const hideStillFrame = (img) => {
    const stillFrame = controllersByImage.get(img)?.stillFrame;
    if (stillFrame) stillFrame.hidden = true;
  };

  const initialFrameCacheKey = (source) => `${CONFIG.initialFrame}:${normalizedUrl(source)}`;

  const rememberStillFrame = (source, stillFrame) => {
    const key = initialFrameCacheKey(source);
    const snapshot = document.createElement('canvas');
    snapshot.width = stillFrame.width;
    snapshot.height = stillFrame.height;
    const context = snapshot.getContext('2d');
    if (!context) return;
    try {
      context.drawImage(stillFrame, 0, 0);
    } catch {
      return;
    }
    stillFramesBySource.delete(key);
    while (stillFramesBySource.size >= stillFrameCacheLimit) {
      stillFramesBySource.delete(stillFramesBySource.keys().next().value);
    }
    stillFramesBySource.set(key, snapshot);
  };

  const restoreRememberedStillFrame = (img, source) => {
    const controller = controllersByImage.get(img);
    const key = initialFrameCacheKey(source);
    const snapshot = stillFramesBySource.get(key);
    if (!controller || !snapshot) return false;
    stillFramesBySource.delete(key);
    stillFramesBySource.set(key, snapshot);
    const stillFrame = document.createElement('canvas');
    stillFrame.className = `${OVERLAY_CLASS}__still`;
    stillFrame.setAttribute('aria-hidden', 'true');
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    stillFrame.width = img.offsetWidth > 0
      ? Math.max(1, Math.round(img.offsetWidth * pixelRatio))
      : snapshot.width;
    stillFrame.height = img.offsetHeight > 0
      ? Math.max(1, Math.round(img.offsetHeight * pixelRatio))
      : snapshot.height;
    const context = stillFrame.getContext('2d');
    if (!context) return false;
    try {
      context.drawImage(snapshot, 0, 0, stillFrame.width, stillFrame.height);
    } catch {
      return false;
    }
    controller.stillFrame = stillFrame;
    controller.overlay.prepend(stillFrame);
    stillFrame.hidden = false;
    return true;
  };

  const freezeCurrentFrame = (img, frameSource = img, {remember = false} = {}) => {
    const controller = controllersByImage.get(img);
    if (!controller
      || !frameSource.complete
      || !frameSource.naturalWidth
      || !frameSource.naturalHeight
      || !img.offsetWidth
      || !img.offsetHeight) return false;

    const stillFrame = controller.stillFrame || document.createElement('canvas');
    stillFrame.className = `${OVERLAY_CLASS}__still`;
    stillFrame.setAttribute('aria-hidden', 'true');
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    stillFrame.width = Math.min(frameSource.naturalWidth, Math.max(1, Math.round(img.offsetWidth * pixelRatio)));
    stillFrame.height = Math.min(frameSource.naturalHeight, Math.max(1, Math.round(img.offsetHeight * pixelRatio)));
    try {
      const context = stillFrame.getContext('2d');
      if (!context) return false;
      context.drawImage(frameSource, 0, 0, stillFrame.width, stillFrame.height);
    } catch (error) {
      console.warn('[Damophus Animated Image Replay] Could not freeze the previous replay.', error);
      return false;
    }
    if (!controller.stillFrame) {
      controller.stillFrame = stillFrame;
      controller.overlay.prepend(stillFrame);
    }
    stillFrame.hidden = false;
    if (remember && controller.source) rememberStillFrame(controller.source, stillFrame);
    return true;
  };

  const releaseReplayOwnership = (img, {freeze = true, remember = false} = {}) => {
    if (activeReplayImage !== img) return;
    const state = replayStatesByImage.get(img);
    if (state) {
      state.generation += 1;
      window.clearTimeout(state.releaseTimer);
      state.releaseTimer = 0;
    }
    if (freeze && !freezeCurrentFrame(img, state?.replayImage || img, {remember})) {
      const stillFrame = controllersByImage.get(img)?.stillFrame;
      if (stillFrame) stillFrame.hidden = false;
    }
    if (state?.replayImage) state.replayImage.hidden = true;
    activeReplayImage = null;
  };

  const claimReplayOwnership = (img) => {
    if (activeReplayImage && activeReplayImage !== img) {
      releaseReplayOwnership(activeReplayImage);
    }
    const state = replayStatesByImage.get(img);
    if (state?.releaseTimer) {
      window.clearTimeout(state.releaseTimer);
      state.releaseTimer = 0;
    }
    activeReplayImage = img;
    hideStillFrame(img);
    if (state?.replayImage) state.replayImage.hidden = true;
  };

  const replayNativeImage = async (img) => {
    claimReplayOwnership(img);
    let state = replayStatesByImage.get(img);
    if (!state) {
      state = {
        generation: 0,
        objectUrl: '',
        releaseTimer: 0,
        source: sourceForImage(img),
        replayImage: controllersByImage.get(img)?.replayImage,
      };
      replayStatesByImage.set(img, state);
    }

    const generation = state.generation += 1;
    const replayDurationPromise = replayDurationForSource(state.source);
    try {
      const objectUrl = URL.createObjectURL(await replayBlobForSource(state.source));
      if (generation !== state.generation || !img.isConnected) {
        URL.revokeObjectURL(objectUrl);
        return;
      }

      const previousObjectUrl = state.objectUrl;
      state.objectUrl = objectUrl;
      replayedImages.add(img);
      const replayImage = state.replayImage;
      if (!replayImage) throw new Error('Replay layer is unavailable');
      if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);
      replayImage.hidden = true;
      replayImage.onload = () => {
        if (state.generation === generation && activeReplayImage === img) replayImage.hidden = false;
      };
      replayImage.onerror = () => {
        if (state.generation === generation && activeReplayImage === img) releaseReplayOwnership(img);
      };
      replayImage.src = objectUrl;
      const replayStartedAt = Date.now();
      void replayDurationPromise.then((timing) => {
        if (state.generation !== generation || activeReplayImage !== img) return;
        const elapsedMs = Date.now() - replayStartedAt;
        state.releaseTimer = window.setTimeout(() => {
          state.releaseTimer = 0;
          if (state.generation === generation && activeReplayImage === img) {
            releaseReplayOwnership(img, {remember: CONFIG.initialFrame === 'last'});
          }
        }, tailCaptureDelay(timing, elapsedMs));
      });
    } catch (error) {
      if (state.generation === generation) releaseReplayOwnership(img, {freeze: false});
      console.warn('[Damophus Animated Image Replay] Replay failed; keeping the current frame.', error);
    }
  };

  const restoreReplaySource = (img) => {
    const state = replayStatesByImage.get(img);
    if (!state) return;
    state.generation += 1;
    window.clearTimeout(state.releaseTimer);
    if (state.replayImage) {
      state.replayImage.onload = null;
      state.replayImage.onerror = null;
    }
    state.replayImage?.removeAttribute('src');
    state.replayImage?.setAttribute('hidden', '');
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    if (activeReplayImage === img) activeReplayImage = null;
    replayStatesByImage.delete(img);
    replayedImages.delete(img);
  };

  const syncOverlay = (controller) => {
    if (disposed) return;
    const {img, overlay} = controller;
    if (!img.isConnected) {
      disposeController(controller);
      return;
    }

    const offsetParent = img.offsetParent || document.body;
    if (overlay.parentElement !== offsetParent) offsetParent.appendChild(overlay);
    overlay.hidden = img.offsetWidth === 0 || img.offsetHeight === 0;
    overlay.style.left = `${img.offsetLeft}px`;
    overlay.style.top = `${img.offsetTop}px`;
    overlay.style.width = `${img.offsetWidth}px`;
    overlay.style.height = `${img.offsetHeight}px`;
    if (!overlay.hidden) controller.freezeInitialFrame?.();
  };

  const resizeObserver = new ResizeObserver((entries) => {
    entries.forEach(({target}) => {
      const controller = controllersByImage.get(target);
      if (controller) syncOverlay(controller);
    });
  });

  const registerController = ({img, overlay, replay, replayImage, source, cancelHoverReplay, resumeHoverReplay, disposePlayback}) => {
    const controller = {cancelHoverReplay, disposePlayback, img, overlay, replay, replayImage, resumeHoverReplay, source};
    controllersByImage.set(img, controller);
    activeControllers.add(controller);
    resizeObserver.observe(img);
    img.addEventListener('load', controller.syncOnLoad = () => syncOverlay(controller));
    syncOverlay(controller);
    return controller;
  };

  function disposeController(controller) {
    if (!activeControllers.delete(controller)) return;
    resizeObserver.unobserve(controller.img);
    controller.img.removeEventListener('load', controller.syncOnLoad);
    controller.disposeInitialFreeze?.();
    controller.disposePlayback?.();
    releaseReplayOwnership(controller.img, {freeze: false});
    restoreReplaySource(controller.img);
    controller.overlay.remove();
  }

  let overlaySyncQueued = false;
  const scheduleOverlaySync = () => {
    if (disposed || overlaySyncQueued) return;
    overlaySyncQueued = true;
    overlaySyncFrame = requestAnimationFrame(() => {
      overlaySyncFrame = 0;
      overlaySyncQueued = false;
      if (disposed) return;
      [...activeControllers].forEach(syncOverlay);
    });
  };

  const createOverlay = (src, type) => {
    const overlay = document.createElement('span');
    overlay.className = OVERLAY_CLASS;
    overlay.dataset.damophusAnimatedSrc = normalizedUrl(src);
    overlay.dataset.damophusAnimatedType = type.name.toLowerCase();
    return overlay;
  };

  const addImageControls = async (img, src, type) => {
    const overlay = createOverlay(src, type);
    const replayImage = document.createElement('img');
    replayImage.className = `${OVERLAY_CLASS}__replay`;
    replayImage.alt = '';
    replayImage.hidden = true;
    overlay.appendChild(replayImage);
    const {controls, replayButton} = createReplayControl();
    overlay.appendChild(controls);

    const replay = () => replayNativeImage(img);
    let controller;
    let pointerInside = false;
    const cancelHoverReplay = () => {
      if (!controller?.hoverReplayTimer) return;
      window.clearTimeout(controller.hoverReplayTimer);
      controller.hoverReplayTimer = 0;
    };
    const scheduleHoverReplay = (pointerType = '') => {
      cancelHoverReplay();
      if (pointerType === 'touch'
        || document.visibilityState !== 'visible'
        || !document.hasFocus()) return;
      const guardDelayMs = Math.max(0, hoverReplayBlockedUntil - Date.now());
      const attemptHoverReplay = () => {
        const remainingGuardMs = hoverReplayBlockedUntil - Date.now();
        if (remainingGuardMs > 0) {
          controller.hoverReplayTimer = window.setTimeout(attemptHoverReplay, remainingGuardMs);
          return;
        }
        controller.hoverReplayTimer = 0;
        if (document.visibilityState === 'visible'
          && document.hasFocus()
          && activeReplayImage !== img
          && pointerInside) replay();
      };
      controller.hoverReplayTimer = window.setTimeout(
        attemptHoverReplay,
        Math.max(CONFIG.hoverReplayDelayMs, guardDelayMs),
      );
    };
    const replayOnHover = (event) => {
      pointerInside = true;
      scheduleHoverReplay(event.pointerType);
    };
    const stopHoverReplay = () => {
      pointerInside = false;
      cancelHoverReplay();
    };
    controller = registerController({
      img,
      overlay,
      replay,
      replayImage,
      source: src,
      cancelHoverReplay,
      resumeHoverReplay: () => {
        if (pointerInside) scheduleHoverReplay();
      },
      disposePlayback: () => {
        cancelHoverReplay();
        img.removeEventListener('pointerenter', replayOnHover);
        img.removeEventListener('pointerleave', stopHoverReplay);
      },
    });

    const initialVisibility = img.style.visibility;
    const initialOpacity = img.style.opacity;
    const playsThroughToTail = CONFIG.initialFrame === "last" && hasManifestDurationSource(src);
    let initialFreezePending = true;
    let initialFrameReady = !playsThroughToTail;
    let initialFreezeTimer = 0;
    if (!playsThroughToTail) img.style.visibility = 'hidden';
    const restoreInitialVisibility = () => {
      img.style.visibility = initialVisibility;
      img.style.opacity = initialOpacity;
    };
    const hideOriginalImage = () => {
      img.style.visibility = initialVisibility;
      img.style.opacity = '0';
    };
    const cleanupInitialFreezeListeners = () => {
      img.removeEventListener('load', freezeInitialFrameAfterLayout);
      img.removeEventListener('error', revealBrokenImage);
      window.clearTimeout(initialFreezeTimer);
      initialFreezeTimer = 0;
    };
    const freezeInitialFrame = () => {
      if (!initialFreezePending) return;
      // Tail mode waits for the native animation to finish before capturing.
      // ResizeObserver can run before that timer, so do not freeze the first frame early.
      if (!initialFrameReady) return;
      if (!freezeCurrentFrame(img, img, {remember: true})) {
        if (img.complete && (!img.naturalWidth || !img.naturalHeight)) {
          initialFreezePending = false;
          cleanupInitialFreezeListeners();
          restoreInitialVisibility();
        }
        return;
      }
      initialFreezePending = false;
      cleanupInitialFreezeListeners();
      hideOriginalImage();
    };
    const freezeInitialFrameAfterLayout = () => requestAnimationFrame(freezeInitialFrame);
    const revealBrokenImage = () => {
      if (!initialFreezePending) return;
      initialFreezePending = false;
      cleanupInitialFreezeListeners();
      restoreInitialVisibility();
    };
    controller.freezeInitialFrame = freezeInitialFrame;
    controller.disposeInitialFreeze = () => {
      cleanupInitialFreezeListeners();
      initialFreezePending = false;
      restoreInitialVisibility();
    };
    const armInitialFrame = () => {
      if (!initialFrameReady) return;
      if (img.complete) freezeInitialFrameAfterLayout();
      else img.addEventListener('load', freezeInitialFrameAfterLayout, {once: true});
    };
    if (restoreRememberedStillFrame(img, src)) {
      initialFreezePending = false;
      initialFrameReady = true;
      cleanupInitialFreezeListeners();
      hideOriginalImage();
    } else if (initialFrameReady) {
      armInitialFrame();
    } else {
      void replayDurationForSource(src).then((timing) => {
        if (!initialFreezePending || !img.isConnected) return;
        initialFreezeTimer = window.setTimeout(() => {
          initialFreezeTimer = 0;
          initialFrameReady = true;
          armInitialFrame();
        }, tailCaptureDelay(timing));
      });
    }
    if (initialFreezePending) img.addEventListener('error', revealBrokenImage, {once: true});

    replayButton?.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
    });
    replayButton?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      replay();
    });
    if (CONFIG.replayOnHover) {
      img.addEventListener('pointerenter', replayOnHover);
      img.addEventListener('pointerleave', stopHoverReplay);
    }
    syncOverlay(controller);
  };

  const enhanceImage = async (img) => {
    if (controllersByImage.has(img) || img.dataset[PLAYER_STATE_KEY] === 'loading') return;
    const src = sourceForImage(img);
    const type = src ? findImageType(img, src) : null;
    if (!src || !type) return;
    img.dataset[PLAYER_STATE_KEY] = 'loading';

    try {
      await addImageControls(img, src, type);
      img.dataset[PLAYER_STATE_KEY] = 'ready';
    } catch (error) {
      console.warn(`[Damophus ${type.name} Replay]`, error);
      img.dataset[PLAYER_STATE_KEY] = 'failed';
    }
  };

  let pendingLargeViewSources = [];
  let largeViewReplayAttempts = 0;
  const scheduleLargeViewReplay = (delayMs) => {
    if (disposed) return;
    window.clearTimeout(largeViewReplayTimer);
    largeViewReplayTimer = window.setTimeout(() => {
      largeViewReplayTimer = 0;
      replayOpenedLargeImage();
    }, delayMs);
  };
  const replayOpenedLargeImage = () => {
    if (disposed || pendingLargeViewSources.length === 0 || largeViewReplayAttempts >= 20) return;
    largeViewReplayAttempts += 1;
    const candidates = document.querySelectorAll(LARGE_VIEW_IMAGE_SELECTOR);
    const target = [...candidates].find((img) => pendingLargeViewSources.includes(normalizedUrl(img.currentSrc || img.src)));

    if (target) {
      replayNativeImage(target);
      pendingLargeViewSources = [];
      return;
    }
    scheduleLargeViewReplay(50);
  };

  const handleDocumentClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!CONFIG.replayWhenOpenedLarge || target.closest('button')) return;
    const controller = target instanceof HTMLImageElement ? controllersByImage.get(target) : null;
    if (!controller) return;
    const replayState = replayStatesByImage.get(controller.img);
    pendingLargeViewSources = [
      normalizedUrl(controller.img.currentSrc || controller.img.src),
      replayState ? normalizedUrl(replayState.source) : '',
    ].filter(Boolean);
    largeViewReplayAttempts = 0;
    scheduleLargeViewReplay(0);
  };

  const pendingScanRoots = new Set();
  let scanQueued = false;
  const scan = (roots = []) => {
    if (disposed) return;
    roots.forEach((root) => pendingScanRoots.add(root));
    if (scanQueued) return;
    scanQueued = true;
    scanFrame = requestAnimationFrame(() => {
      scanFrame = 0;
      scanQueued = false;
      if (disposed) return;
      const rootsToScan = [...pendingScanRoots];
      pendingScanRoots.clear();
      [...activeControllers].forEach((controller) => {
        if (!controller.img.isConnected) disposeController(controller);
      });
      [...replayedImages].forEach((img) => {
        if (!img.isConnected) restoreReplaySource(img);
      });
      rootsToScan.forEach((root) => {
        const images = [];
        if (root instanceof HTMLImageElement) images.push(root);
        if (root instanceof Element || root instanceof Document || root instanceof DocumentFragment) {
          images.push(...root.querySelectorAll('img'));
        }
        images.forEach((img) => {
          if (!img.closest(LARGE_VIEW_ROOT_SELECTOR)) void enhanceImage(img);
        });
      });
      scheduleOverlaySync();
      if (pendingLargeViewSources.length > 0) replayOpenedLargeImage();
    });
  };

  const observedRoots = new Set();
  const observer = new MutationObserver((records) => {
    if (disposed) return;
    const addedNodes = records.flatMap((record) => [...record.addedNodes]);
    scan(addedNodes);
  });
  const mutationObserverOptions = {childList: true, subtree: true};
  const rootElementFor = (root) => root instanceof Document ? root.body : root;
  const refreshObservedRoots = () => {
    observer.disconnect();
    [...observedRoots].forEach((root) => {
      if (!(root instanceof Node) || !root.isConnected) {
        observedRoots.delete(root);
        return;
      }
      observer.observe(root, mutationObserverOptions);
    });
  };
  const scanRoot = (root) => {
    if (disposed) return;
    const rootElement = rootElementFor(root);
    if (!(rootElement instanceof Node)) return;
    if (!observedRoots.has(rootElement)) {
      observedRoots.add(rootElement);
      observer.observe(rootElement, mutationObserverOptions);
    }
    scan([root]);
  };
  const disposeRoot = (root) => {
    if (disposed) return;
    const rootElement = rootElementFor(root);
    if (!(rootElement instanceof Node)) return;
    observedRoots.delete(rootElement);
    refreshObservedRoots();
    [...activeControllers].forEach((controller) => {
      if (rootElement.contains(controller.img)) disposeController(controller);
    });
  };

  cleanupLegacyPlayers();
  installStyles();
  if (scanDocument) scanRoot(document);
  const blockHoverReplay = () => {
    hoverReplayBlockedUntil = Date.now() + CONFIG.focusReturnGuardMs;
    [...activeControllers].forEach((controller) => controller.cancelHoverReplay?.());
  };
  const resumeHoveredImages = () => {
    [...activeControllers].forEach((controller) => controller.resumeHoverReplay?.());
  };
  const handleFocus = () => {
    blockHoverReplay();
    resumeHoveredImages();
  };
  const handleVisibilityChange = () => {
    blockHoverReplay();
    if (document.visibilityState === 'visible') resumeHoveredImages();
  };
  window.addEventListener('resize', scheduleOverlaySync);
  window.addEventListener('blur', blockHoverReplay);
  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  document.addEventListener('click', handleDocumentClick, true);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    observedRoots.clear();
    pendingScanRoots.clear();
    window.cancelAnimationFrame(scanFrame);
    window.cancelAnimationFrame(overlaySyncFrame);
    window.clearTimeout(largeViewReplayTimer);
    scanFrame = 0;
    overlaySyncFrame = 0;
    largeViewReplayTimer = 0;
    scanQueued = false;
    overlaySyncQueued = false;
    window.removeEventListener('resize', scheduleOverlaySync);
    window.removeEventListener('blur', blockHoverReplay);
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    document.removeEventListener('click', handleDocumentClick, true);
    [...activeControllers].forEach(disposeController);
    [...replayedImages].forEach(restoreReplaySource);
    replayBlobPromisesBySource.clear();
    replayDurationPromisesBySource.clear();
    document.getElementById(STYLE_ID)?.remove();
  };

  return {dispose, scanRoot, disposeRoot};
};
