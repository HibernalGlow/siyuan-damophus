// Runtime DOM types are intentionally local to this browser-only player.
// @ts-nocheck

export interface AnimatedImageReplayOptions {
  showReplayButton?: boolean;
  replayOnHover?: boolean;
  replayLabel?: string;
  hoverReplayDelayMs?: number;
  focusReturnGuardMs?: number;
  replayBlobCacheSize?: number;
  replayWhenOpenedLarge?: boolean;
  scanDocument?: boolean;
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
  }
}

export const startAnimatedImageReplay = ({
  showReplayButton = true,
  replayOnHover = true,
  replayLabel = "Replay image",
  hoverReplayDelayMs = 700,
  focusReturnGuardMs = 1000,
  replayBlobCacheSize = 4,
  replayWhenOpenedLarge = true,
  scanDocument = true,
}: AnimatedImageReplayOptions = {}): AnimatedImageReplayHandle => {
  window.__inkloomAnimatedImagePlayer?.dispose?.();

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value) || minimum));
  const CONFIG = {
    imageTypes: [
      {name: 'WebP', extensions: ['webp']},
      {name: 'GIF', extensions: ['gif']},
      {name: 'AVIF', extensions: ['avif']},
      {name: 'APNG', extensions: ['apng']},
    ],
    showReplayButton,
    replayOnHover,
    hoverReplayDelayMs: clamp(hoverReplayDelayMs, 100, 5000),
    focusReturnGuardMs: clamp(focusReturnGuardMs, 0, 5000),
    replayBlobCacheSize: Math.round(clamp(replayBlobCacheSize, 1, 16)),
    replayWhenOpenedLarge: replayWhenOpenedLarge !== false,
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
  const replayedImages = new Set();
  const activeControllers = new Set();
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

  const sourceForImage = (img) => (
    img.dataset.damophusAnimatedSrc
    ?? img.dataset.inkloomAnimatedSrc
    ?? img.getAttribute('src')
    ?? img.currentSrc
    ?? img.src
    ?? ''
  );

  const findImageType = (img, source) => {
    const explicitType = (
      img.dataset.damophusAnimatedType
      ?? img.dataset.inkloomAnimatedType
    )?.toLowerCase();
    if (explicitType) {
      return CONFIG.imageTypes.find((type) => type.name.toLowerCase() === explicitType);
    }
    const extension = extensionFromUrl(source);
    return CONFIG.imageTypes.find((type) => type.extensions.includes(extension));
  };

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
      .${OVERLAY_CLASS}__replay {
        position: absolute;
        inset: 0;
        z-index: 1;
        display: block;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }
      .${OVERLAY_CLASS}__controls {
        position: absolute;
        right: 4px;
        bottom: 4px;
        display: flex;
        z-index: 2;
        pointer-events: auto;
        isolation: isolate;
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

  const createButton = (label) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.title = label;
    return button;
  };

  const createReplayControl = () => {
    const controls = document.createElement('span');
    controls.className = `${OVERLAY_CLASS}__controls`;
    const replayButton = CONFIG.showReplayButton ? createButton(replayLabel) : null;
    if (replayButton) {
      replayButton.innerHTML = '<svg aria-hidden="true"><use xlink:href="#iconRefresh"></use></svg>';
      controls.appendChild(replayButton);
    }
    return {controls, replayButton};
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

  const createReplayLayer = () => {
    const image = document.createElement('img');
    image.className = `${OVERLAY_CLASS}__replay`;
    image.alt = '';
    return image;
  };

  const stateForImage = (img) => {
    let state = replayStatesByImage.get(img);
    if (state) return state;
    const controller = controllersByImage.get(img);
    state = {
      generation: 0,
      objectUrl: '',
      pendingObjectUrls: new Set(),
      source: sourceForImage(img),
      mode: controller ? 'overlay' : 'source',
      originalSrc: controller ? null : img.getAttribute('src'),
      originalSrcset: controller ? null : img.getAttribute('srcset'),
    };
    replayStatesByImage.set(img, state);
    return state;
  };

  const replayImage = async (img) => {
    if (disposed || !img.isConnected) return;
    const state = stateForImage(img);
    const generation = state.generation += 1;
    try {
      const objectUrl = URL.createObjectURL(await replayBlobForSource(state.source));
      if (disposed || generation !== state.generation || !img.isConnected) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      state.pendingObjectUrls.add(objectUrl);
      replayedImages.add(img);

      if (state.mode === 'source') {
        const previousObjectUrl = state.objectUrl;
        state.objectUrl = objectUrl;
        state.pendingObjectUrls.delete(objectUrl);
        img.addEventListener('load', () => {
          if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);
        }, {once: true});
        img.srcset = '';
        img.src = objectUrl;
        return;
      }

      const controller = controllersByImage.get(img);
      if (!controller) {
        state.pendingObjectUrls.delete(objectUrl);
        URL.revokeObjectURL(objectUrl);
        return;
      }
      const nextReplayImage = createReplayLayer();
      controller.overlay.insertBefore(nextReplayImage, controller.controls);
      nextReplayImage.onload = () => {
        state.pendingObjectUrls.delete(objectUrl);
        if (disposed || generation !== state.generation || !img.isConnected) {
          nextReplayImage.remove();
          URL.revokeObjectURL(objectUrl);
          return;
        }
        const previousReplayImage = controller.replayImage;
        const previousObjectUrl = state.objectUrl;
        controller.replayImage = nextReplayImage;
        state.objectUrl = objectUrl;
        previousReplayImage?.remove();
        if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);
      };
      nextReplayImage.onerror = () => {
        state.pendingObjectUrls.delete(objectUrl);
        nextReplayImage.remove();
        URL.revokeObjectURL(objectUrl);
      };
      nextReplayImage.src = objectUrl;
    } catch (error) {
      console.warn('[Damophus Animated Image Replay] Replay failed; keeping the native image.', error);
    }
  };

  const restoreReplaySource = (img) => {
    const state = replayStatesByImage.get(img);
    if (!state) return;
    state.generation += 1;
    state.pendingObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    state.pendingObjectUrls.clear();
    const controller = controllersByImage.get(img);
    controller?.replayImage?.remove();
    if (controller) controller.replayImage = null;
    if (state.mode === 'source') {
      if (state.originalSrc === null) img.removeAttribute('src');
      else img.setAttribute('src', state.originalSrc);
      if (state.originalSrcset === null) img.removeAttribute('srcset');
      else img.setAttribute('srcset', state.originalSrcset);
    }
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
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
  };

  const resizeObserver = new ResizeObserver((entries) => {
    entries.forEach(({target}) => {
      const controller = controllersByImage.get(target);
      if (controller) syncOverlay(controller);
    });
  });

  const registerController = (controller) => {
    controllersByImage.set(controller.img, controller);
    activeControllers.add(controller);
    resizeObserver.observe(controller.img);
    controller.img.addEventListener('load', controller.syncOnLoad = () => syncOverlay(controller));
    syncOverlay(controller);
    return controller;
  };

  function disposeController(controller) {
    if (!activeControllers.delete(controller)) return;
    resizeObserver.unobserve(controller.img);
    controller.img.removeEventListener('load', controller.syncOnLoad);
    controller.disposePlayback?.();
    restoreReplaySource(controller.img);
    controllersByImage.delete(controller.img);
    delete controller.img.dataset[PLAYER_STATE_KEY];
    controller.overlay.remove();
  }

  let overlaySyncQueued = false;
  const scheduleOverlaySync = () => {
    if (disposed || overlaySyncQueued) return;
    overlaySyncQueued = true;
    overlaySyncFrame = requestAnimationFrame(() => {
      overlaySyncFrame = 0;
      overlaySyncQueued = false;
      if (!disposed) [...activeControllers].forEach(syncOverlay);
    });
  };

  const addImageControls = (img, source, type) => {
    const overlay = document.createElement('span');
    overlay.className = OVERLAY_CLASS;
    overlay.dataset.damophusAnimatedSrc = normalizedUrl(source);
    overlay.dataset.damophusAnimatedType = type.name.toLowerCase();
    const {controls, replayButton} = createReplayControl();
    overlay.appendChild(controls);

    let controller;
    let pointerInside = false;
    const cancelHoverReplay = () => {
      if (!controller?.hoverReplayTimer) return;
      window.clearTimeout(controller.hoverReplayTimer);
      controller.hoverReplayTimer = 0;
    };
    const scheduleHoverReplay = (pointerType = '') => {
      cancelHoverReplay();
      if (pointerType === 'touch' || document.visibilityState !== 'visible' || !document.hasFocus()) return;
      const attemptReplay = () => {
        const remainingGuardMs = hoverReplayBlockedUntil - Date.now();
        if (remainingGuardMs > 0) {
          controller.hoverReplayTimer = window.setTimeout(attemptReplay, remainingGuardMs);
          return;
        }
        controller.hoverReplayTimer = 0;
        if (pointerInside && document.visibilityState === 'visible' && document.hasFocus()) void replayImage(img);
      };
      controller.hoverReplayTimer = window.setTimeout(
        attemptReplay,
        Math.max(CONFIG.hoverReplayDelayMs, hoverReplayBlockedUntil - Date.now()),
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
      controls,
      replayImage: null,
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

    replayButton?.addEventListener('pointerdown', (event) => event.stopPropagation());
    replayButton?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void replayImage(img);
    });
    if (CONFIG.replayOnHover) {
      img.addEventListener('pointerenter', replayOnHover);
      img.addEventListener('pointerleave', stopHoverReplay);
    }
  };

  const enhanceImage = (img) => {
    if (disposed || controllersByImage.has(img) || img.dataset[PLAYER_STATE_KEY] === 'loading') return;
    const source = sourceForImage(img);
    const type = source ? findImageType(img, source) : null;
    if (!source || !type) return;
    img.dataset[PLAYER_STATE_KEY] = 'loading';
    try {
      addImageControls(img, source, type);
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
    const target = [...document.querySelectorAll(LARGE_VIEW_IMAGE_SELECTOR)]
      .find((img) => pendingLargeViewSources.includes(normalizedUrl(img.currentSrc || img.src)));
    if (target) {
      void replayImage(target);
      pendingLargeViewSources = [];
      return;
    }
    scheduleLargeViewReplay(50);
  };

  const handleDocumentClick = (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !CONFIG.replayWhenOpenedLarge || target.closest('button')) return;
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
          if (!img.closest(LARGE_VIEW_ROOT_SELECTOR)) enhanceImage(img);
        });
      });
      scheduleOverlaySync();
      if (pendingLargeViewSources.length > 0) replayOpenedLargeImage();
    });
  };

  const observedRoots = new Set();
  const observer = new MutationObserver((records) => {
    if (!disposed) scan(records.flatMap((record) => [...record.addedNodes]));
  });
  const mutationObserverOptions = {childList: true, subtree: true};
  const rootElementFor = (root) => root instanceof Document ? root.body : root;
  const refreshObservedRoots = () => {
    observer.disconnect();
    [...observedRoots].forEach((root) => {
      if (!(root instanceof Node) || !root.isConnected) observedRoots.delete(root);
      else observer.observe(root, mutationObserverOptions);
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
    window.removeEventListener('resize', scheduleOverlaySync);
    window.removeEventListener('blur', blockHoverReplay);
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    document.removeEventListener('click', handleDocumentClick, true);
    [...activeControllers].forEach(disposeController);
    [...replayedImages].forEach(restoreReplaySource);
    replayBlobPromisesBySource.clear();
    document.getElementById(STYLE_ID)?.remove();
  };

  return {dispose, scanRoot, disposeRoot};
};
