import { getLogger } from "@/libs/logger";
import { isMobile } from "@/utils";
import { sql } from "@/api";
import { assertAttrWriteSucceeded } from "./cover-attrs";
import {
  normalizeCoverPosition,
  parseCoverPosition,
  serializeCoverPosition,
  selectCoverPositionFromAttrs,
  COVER_POSITION_ATTRIBUTE,
  COVER_POSITION_MARKER,
  COVER_POSITION_MOBILE_ATTRIBUTE,
} from "./cover-position";
import { COVER_CACHE_ATTRIBUTE, COVER_SOURCE_ATTRIBUTE } from "./cover-local-cache";

const log = getLogger("lets-more-background");

/** Applies the position to all cover media and records the runtime marker. */
export function applyCoverPosition(background: HTMLElement, position: number): boolean {
  const media = [...background.querySelectorAll<HTMLElement>(
    ".protyle-background__img img, .protyle-background__video",
  )];
  if (media.length === 0) return false;
  const objectPosition = `center ${Number(position.toFixed(2))}%`;
  media.forEach((element) => { element.style.objectPosition = objectPosition; });
  background.setAttribute(COVER_POSITION_MARKER, String(position));
  return true;
}

export async function restoreCoverPosition(background: HTMLElement): Promise<void> {
  const blockId =
    background.getAttribute("data-node-id") ||
    background.closest(".protyle")?.querySelector<HTMLElement>(".protyle-title")?.getAttribute("data-node-id");
  if (!blockId || !background.isConnected) {
    log.debug("restore position skipped", { blockId, connected: background.isConnected });
    return;
  }
  // Fast path: this DOM was already restored once (scanRoot runs on both
  // loaded-protyle-static and switch-protyle, and again after cache
  // hydration). Re-apply the cached value without another attr read.
  const marked = normalizeCoverPosition(background.getAttribute(COVER_POSITION_MARKER));
  if (marked !== null && applyCoverPosition(background, marked)) {
    log.debug("restore position: cached", { blockId, position: marked });
    return;
  }
  try {
    log.debug("restore position: reading attrs", { blockId });
    const response = await fetch("/api/attr/getBlockAttrs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: blockId }),
    });
    if (!response.ok) {
      log.warn("restore position: attr read failed", { blockId, status: response.status });
      return;
    }
    const data = await response.json();
    const attrs = (data?.data || {}) as Record<string, string>;
    const position = selectCoverPositionFromAttrs(attrs, isMobile);
    log.debug("restore position: attrs received", {
      blockId,
      storedPosition: attrs[COVER_POSITION_ATTRIBUTE] ?? null,
      storedMobilePosition: attrs[COVER_POSITION_MOBILE_ATTRIBUTE] ?? null,
      titleImg: attrs["title-img"] ?? null,
      parsedPosition: position,
    });
    if (position === null) return;
    if (!applyCoverPosition(background, position)) {
      log.warn("restore position: media not found", { blockId });
      return;
    }
    log.info("restore position: applied", { blockId, position, mediaCount: background.querySelectorAll(
      ".protyle-background__img img, .protyle-background__video",
    ).length });
    // Mobile never persists during restore: its attribute is written only
    // when the position is actually adjusted on the device. Desktop keeps
    // migrating a legacy title-img position into the shared attribute.
    if (!isMobile && attrs[COVER_POSITION_ATTRIBUTE] !== serializeCoverPosition(position)) {
      await persistCoverPosition(blockId, position);
    }
  } catch (error) {
    log.error("restore position failed", { blockId, error });
  }
}

export async function persistCoverPosition(blockId: string, position: number): Promise<void> {
  const serialized = serializeCoverPosition(position);
  if (serialized === null) return;
  log.info("persist position: writing attr", { blockId, position, serialized });
  try {
    const response = await fetch("/api/attr/setBlockAttrs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: blockId, attrs: { [COVER_POSITION_ATTRIBUTE]: serialized } }),
    });
    await assertAttrWriteSucceeded(response);
    log.info("persist position: write succeeded", { blockId, position, status: response.status });
  } catch (error) {
    log.error("persist position: write failed", { blockId, position, error });
    throw error;
  }
}

/**
 * Clears the mobile cover position attribute from every document that has
 * one, so mobile follows the shared/desktop position again. Documents
 * without the attribute are never written. Open roots of cleared documents
 * drop the runtime restore marker and re-restore from the remaining attrs.
 */
export async function resetMobileCoverPositions(
  getOpenRoots: () => Iterable<HTMLElement>,
): Promise<{ cleared: number }> {
  const clearedIds = new Set<string>();
  let rows: Array<{ block_id?: string }> = [];
  try {
    rows = await sql(
      `SELECT block_id FROM attributes WHERE name = '${COVER_POSITION_MOBILE_ATTRIBUTE}'`,
    );
  } catch (error) {
    log.error("reset mobile positions: query failed", error);
    throw error;
  }
  for (const row of rows) {
    const blockId = row?.block_id;
    if (!blockId) continue;
    try {
      const write = await fetch("/api/attr/setBlockAttrs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: blockId, attrs: { [COVER_POSITION_MOBILE_ATTRIBUTE]: "" } }),
      });
      await assertAttrWriteSucceeded(write);
      clearedIds.add(blockId);
    } catch (error) {
      log.warn("reset mobile positions: block write failed", { blockId, error });
    }
  }
  for (const root of getOpenRoots()) {
    const background = root.querySelector<HTMLElement>(".protyle-background");
    if (!background) continue;
    const blockId =
      background.getAttribute("data-node-id") ||
      root.querySelector<HTMLElement>(".protyle-title")?.getAttribute("data-node-id");
    if (!blockId || !clearedIds.has(blockId)) continue;
    background.removeAttribute(COVER_POSITION_MARKER);
    void restoreCoverPosition(background);
  }
  log.info("reset mobile positions: done", { cleared: clearedIds.size });
  return { cleared: clearedIds.size };
}

/**
 * 题头图多合一位置调整控制器：
 * 1. 快捷模式：按住 Alt 键，鼠标在题头图上按下直接上下拖拽（光标自动变抓手，松手自动保存）
 * 2. 滚轮微调：鼠标悬浮在题头图上，按住 Alt + 滚轮上下滚动，以 2% 为步长平滑微调（防抖自动保存）
 * 3. 纯鼠标模式：鼠标左键在题头图上长按 300ms 触发拖拽，松手自动保存
 * 4. 全局直接拖模式：若开启 directDrag，鼠标左键一拖即走
 * 5. 交互反馈：拖拽/微调过程中居中显示轻量透明 HUD 百分比徽章 (如 45%)，松手平滑淡出
 */
export function initCoverPositionControls(
  background: HTMLElement,
  options: { directDrag?: boolean },
): () => void {
  let isDragging = false;
  let isLongPressActive = false;
  let startY = 0;
  let startX = 0;
  let startPositionY = 50;
  let currentPositionY = 50;
  let longPressTimer: any = null;
  let wheelSaveTimer: any = null;

  const getMediaElement = (): HTMLElement | null => {
    return (
      background.querySelector<HTMLVideoElement>(".protyle-background__video") ||
      background.querySelector<HTMLImageElement>(".protyle-background__img img")
    );
  };

  const parsePositionY = (el: HTMLElement): number => {
    const styleAttribute = el.getAttribute("style") || "";
    const styleAttributeObjectPosition = styleAttribute.match(
      /(?:^|;)\s*object-position\s*:\s*([^;]+)/i,
    )?.[1]?.trim() || "";
    const inlineObjectPosition = el.style.getPropertyValue("object-position") || el.style.objectPosition;
    const computedObjectPosition = typeof getComputedStyle === "function"
      ? getComputedStyle(el).objectPosition
      : "";
    const cssValues = [styleAttributeObjectPosition, inlineObjectPosition, computedObjectPosition]
      .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
    for (const cssValue of cssValues) {
      const cssPercentValues = [...cssValue.matchAll(/(-?\d+(?:\.\d+)?)\s*%/g)];
      const percent = cssPercentValues.length > 0
        ? normalizeCoverPosition(cssPercentValues.at(-1)?.[1])
        : parseCoverPosition(cssValue);
      if (percent !== null) return percent;
      const pixelMatch = cssValue.match(/(?:center\s+)?(-?\d+(?:\.\d+)?)px/i);
      if (pixelMatch && el instanceof HTMLImageElement && el.naturalWidth > 0) {
        const overflow = el.naturalHeight * (el.clientWidth / el.naturalWidth) - el.clientHeight;
        if (overflow > 0) return Math.max(0, Math.min(100, -Number(pixelMatch[1]) / overflow * 100));
      }
    }
    return 50;
  };

  const updateElementsPosition = (percent: number) => {
    const clamped = Math.max(0, Math.min(100, percent));
    currentPositionY = clamped;
    const val = `center ${clamped.toFixed(2)}%`;
    const img = background.querySelector<HTMLImageElement>(".protyle-background__img img");
    if (img) img.style.objectPosition = val;
    const video = background.querySelector<HTMLVideoElement>(".protyle-background__video");
    if (video) video.style.objectPosition = val;
  };

  const showHUD = (percent: number, label = "题头图位置") => {
    let hud = background.querySelector<HTMLElement>(".damophus-position-hud");
    if (!hud) {
      hud = document.createElement("div");
      hud.className = "damophus-position-hud";
      hud.setAttribute(
        "style",
        "position: absolute; top: 14px; left: 50%; transform: translateX(-50%) scale(0.95); " +
        "background: rgba(15, 23, 42, 0.88); backdrop-filter: blur(10px); " +
        "color: #f8fafc; font-family: ui-monospace, SFMono-Regular, monospace; " +
        "font-size: 12px; font-weight: 600; padding: 4px 14px; border-radius: 9999px; " +
        "border: 1px solid rgba(255, 255, 255, 0.18); box-shadow: 0 4px 18px rgba(0, 0, 0, 0.38); " +
        "pointer-events: none; z-index: 100; display: flex; align-items: center; gap: 6px; " +
        "opacity: 0; transition: opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1), transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);",
      );
      background.appendChild(hud);
    }

    hud.innerHTML = `<span>↕️ ${label}</span><span style="color: #38bdf8; font-weight: 700; font-size: 13px;">${Math.round(percent)}%</span>`;
    hud.style.opacity = "1";
    hud.style.transform = "translateX(-50%) scale(1)";

    const timerKey = "__damophus_hud_timer__";
    if ((hud as any)[timerKey]) {
      clearTimeout((hud as any)[timerKey]);
    }
  };

  const hideHUD = (delay = 750) => {
    const hud = background.querySelector<HTMLElement>(".damophus-position-hud");
    if (!hud) return;
    const timerKey = "__damophus_hud_timer__";
    if ((hud as any)[timerKey]) {
      clearTimeout((hud as any)[timerKey]);
    }
    (hud as any)[timerKey] = setTimeout(() => {
      hud.style.opacity = "0";
      hud.style.transform = "translateX(-50%) scale(0.95)";
    }, delay);
  };

  let positionObserverTimer: ReturnType<typeof setTimeout> | null = null;
  let saveQueue: Promise<void> = Promise.resolve();
  let nativePositionActive = false;

  const savePositionToBlock = (positionPercent: number): void => {
    const blockId =
      background.getAttribute("data-node-id") ||
      background.closest(".protyle")?.querySelector<HTMLElement>(".protyle-title")?.getAttribute("data-node-id") ||
      background.closest(".protyle")?.querySelector<HTMLElement>("[data-node-id]")?.getAttribute("data-node-id");

    if (!blockId) {
      log.warn("save position skipped: block id missing");
      return;
    }

    const serialized = serializeCoverPosition(positionPercent);
    if (serialized === null) {
      log.warn("save position skipped: invalid position", { blockId, positionPercent });
      return;
    }
    // Keep the runtime restore marker in sync so the next scan of this DOM
    // fast-path restores the just-saved value instead of a stale one.
    background.setAttribute(COVER_POSITION_MARKER, serialized);
    log.debug("save position queued", { blockId, positionPercent, serialized });
    saveQueue = saveQueue.then(async () => {
      // Mobile adjustments go to their own attribute so they never clobber
      // the desktop crop (the percentage means a different band there).
      const positionAttr = isMobile ? COVER_POSITION_MOBILE_ATTRIBUTE : COVER_POSITION_ATTRIBUTE;
      const attrs: Record<string, string> = { [positionAttr]: serialized };
      // Native SiYuan confirmation can persist the currently rendered blob URL.
      // Repair that address while saving the position so the next device can load it.
      try {
        const response = await fetch("/api/attr/getBlockAttrs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: blockId }),
        });
        const data = await response.json();
        const current = (data?.data || {}) as Record<string, string>;
        log.debug("save position: current attrs read", {
          blockId,
          titleImg: current["title-img"] ?? null,
          sourceUrl: current[COVER_SOURCE_ATTRIBUTE] ?? null,
          cachePath: current[COVER_CACHE_ATTRIBUTE] ?? null,
        });
        if (/url\(\s*[\"']?blob:/i.test(current["title-img"] || "")) {
          const stable = (current[COVER_SOURCE_ATTRIBUTE] || current[COVER_CACHE_ATTRIBUTE] || "").trim();
          if (stable) attrs["title-img"] = `background-image:url("${stable.replace(/\"/g, "%22")}")`;
        }
      } catch (error) {
        log.warn("save position: current attr read failed", { blockId, error });
      }
      log.info("save position: writing attrs", { blockId, attrs });
      const response = await fetch("/api/attr/setBlockAttrs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: blockId, attrs }),
      });
      await assertAttrWriteSucceeded(response);
      log.info("save position: write succeeded", { blockId, position: serialized, status: response.status });
    }).catch((error) => {
      log.error("save position failed", { blockId, position: serialized, error });
    });
  };

  const scheduleNativePositionSave = () => {
    if (positionObserverTimer) clearTimeout(positionObserverTimer);
    const cancelButton = background.querySelector<HTMLElement>('[data-type="cancel"]');
    if (cancelButton && !cancelButton.classList.contains("fn__none")) nativePositionActive = true;
    log.debug("native position observer scheduled");
    positionObserverTimer = setTimeout(() => {
      positionObserverTimer = null;
      if (nativePositionActive) {
        log.debug("native position observer skipped while native drag is active");
        return;
      }
      const media = getMediaElement();
      const position = media ? parsePositionY(media) : null;
      log.debug("native position observer fired", { position });
      if (position !== null) savePositionToBlock(position);
    }, 450);
  };

  const positionObserver = new MutationObserver((records) => {
    if (records.some((record) => record.attributeName === "style")) scheduleNativePositionSave();
  });
  const image = background.querySelector<HTMLImageElement>(".protyle-background__img img");
  const video = background.querySelector<HTMLVideoElement>(".protyle-background__video");
  image && positionObserver.observe(image, { attributes: true, attributeFilter: ["style"] });
  video && positionObserver.observe(video, { attributes: true, attributeFilter: ["style"] });

  // SiYuan's native cover drag owns document.onmouseup and may bypass the
  // attribute observer. Capture the release before the native handler clears
  // its cursor and persist the final rendered position explicitly.
  const handleNativePositionMouseUp = () => {
    const media = getMediaElement();
    // This listener is bound on the document, so every click in any note
    // lands here. Bail out silently before touching the DOM or the logger
    // unless a native position gesture is actually in progress.
    if (!media) return;
    const cursorMove = media.style.cursor === "move";
    if (!nativePositionActive && !cursorMove) return;
    log.debug("native mouseup captured", {
      hasMedia: true,
      cursor: media.style.cursor || null,
      style: media.getAttribute("style") || null,
      nativePositionActive,
    });
    const position = parsePositionY(media);
    log.info("native mouseup position parsed", {
      position,
      styleAttributeObjectPosition: media.getAttribute("style")?.match(
        /(?:^|;)\s*object-position\s*:\s*([^;]+)/i,
      )?.[1]?.trim() || null,
      inlineObjectPosition: media.style.objectPosition || null,
      computedObjectPosition: typeof getComputedStyle === "function" ? getComputedStyle(media).objectPosition : null,
    });
    if (positionObserverTimer) {
      clearTimeout(positionObserverTimer);
      positionObserverTimer = null;
    }
    nativePositionActive = false;
    savePositionToBlock(position);
  };
  document.addEventListener("mouseup", handleNativePositionMouseUp, true);

  // SiYuan's native handler indexes three toolbar groups inside the image container.
  // Cover layout may move the first group below the icon, so put it back for the
  // native position gesture and restore the configured layout after confirmation.
  const restoreNativeToolbar = () => {
    const imageContainer = background.querySelector<HTMLElement>(".protyle-background__img");
    const positionButton = background.querySelector<HTMLElement>('[data-type="position"]');
    const nativeToolbar = positionButton?.closest<HTMLElement>(".protyle-icons");
    if (imageContainer && nativeToolbar && nativeToolbar.parentElement !== imageContainer) {
      imageContainer.appendChild(nativeToolbar);
    }
  };
  const restoreConfiguredToolbar = () => {
    const nativeToolbar = background.querySelector<HTMLElement>('[data-type="position"]')?.closest<HTMLElement>(".protyle-icons");
    const infoArea = background.querySelector<HTMLElement>(".protyle-background__ia");
    const tags = infoArea?.querySelector<HTMLElement>(".b3-chips__doctag");
    if (infoArea && nativeToolbar && nativeToolbar.parentElement !== infoArea) {
      infoArea.insertBefore(nativeToolbar, tags ?? infoArea.querySelector(".protyle-background__action"));
    }
  };
  const handleNativeToolbarClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-type="position"]')) {
      log.debug("native position button clicked");
      nativePositionActive = true;
      restoreNativeToolbar();
    } else if (target?.closest('[data-type="cancel"], [data-type="confirm"]')) {
      log.debug("native position action clicked", { type: target.closest<HTMLElement>("[data-type]")?.getAttribute("data-type") });
      nativePositionActive = false;
      setTimeout(restoreConfiguredToolbar, 0);
    }
  };
  background.addEventListener("click", handleNativeToolbarClick, true);

  // 鼠标悬停及按键响应
  const handleMouseMoveOrKey = (e: MouseEvent | KeyboardEvent) => {
    if (isDragging) return;
    const media = getMediaElement();
    if (!media) return;
    // Let SiYuan's native confirm/cancel position mode own the gesture.
    if (media.style.cursor === "move") return;
    if (e.altKey || options.directDrag) {
      background.style.cursor = "grab";
    } else {
      background.style.cursor = "";
    }
  };

  const handleMouseLeave = () => {
    if (!isDragging) {
      background.style.cursor = "";
    }
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  // 滚轮微调 (Alt + Wheel)
  const handleWheel = (e: WheelEvent) => {
    if (!e.altKey) return;
    const media = getMediaElement();
    if (!media) return;

    e.preventDefault();
    e.stopPropagation();

    currentPositionY = parsePositionY(media);
    const step = e.deltaY > 0 ? 2.5 : -2.5;
    updateElementsPosition(currentPositionY + step);

    showHUD(currentPositionY, "滚轮微调");

    if (wheelSaveTimer) clearTimeout(wheelSaveTimer);
    wheelSaveTimer = setTimeout(() => {
      savePositionToBlock(currentPositionY);
      hideHUD(800);
    }, 400);
  };

  // 鼠标按下：统一处理 Alt 拖拽、长按 300ms 激活、直接拖拽
  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;

    const target = e.target as HTMLElement | null;
    if (target?.closest(".protyle-icons, .protyle-background__action, .protyle-background__tags, button, [data-type], .damophus-position-hud")) {
      return;
    }

    const media = getMediaElement();
    if (!media) return;
    if (media.style.cursor === "move") return;

    startX = e.clientX;
    startY = e.clientY;
    startPositionY = parsePositionY(media);
    currentPositionY = startPositionY;

    const isAlt = e.altKey;
    const isDirect = options.directDrag === true;

    if (isAlt || isDirect) {
      e.preventDefault();
      isDragging = true;
      background.style.cursor = "grabbing";
      document.body.style.cursor = "grabbing";
      showHUD(currentPositionY, isAlt ? "Alt 快捷拖拽" : "题头图拖拽");
    } else {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        isLongPressActive = true;
        isDragging = true;
        background.style.cursor = "grabbing";
        document.body.style.cursor = "grabbing";
        showHUD(currentPositionY, "长按已激活");
      }, 300);
    }

    const onWindowMouseMove = (moveEvent: MouseEvent) => {
      const moveDist = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);

      if (!isDragging && longPressTimer && moveDist > 6) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        return;
      }

      if (!isDragging) return;

      moveEvent.preventDefault();

      const containerHeight = background.clientHeight || 200;
      const deltaPercent = ((startY - moveEvent.clientY) / containerHeight) * 100 + startPositionY;
      updateElementsPosition(deltaPercent);

      const label = isAlt ? "Alt 快捷拖拽" : isLongPressActive ? "长按拖拽" : "题头图拖拽";
      showHUD(currentPositionY, label);
    };

    const onWindowMouseUp = (upEvent: MouseEvent) => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }

      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);

      background.style.cursor = "";
      document.body.style.cursor = "";

      if (isDragging) {
        isDragging = false;
        isLongPressActive = false;
        upEvent.preventDefault();
        upEvent.stopPropagation();

        log.info("custom drag finished", { position: currentPositionY });
        savePositionToBlock(currentPositionY);
        hideHUD(800);
      }
    };

    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
  };

  // Pointer-based adjusters only exist on desktop. Mobile gets a dedicated
  // touch path: hold ~300ms to engage the drag, then move vertically. Any
  // larger movement before the timer fires is a scroll gesture and aborts.
  let removeTouchHandlers: (() => void) | null = null;
  if (!isMobile) {
    background.addEventListener("mousedown", handleMouseDown);
    background.addEventListener("wheel", handleWheel, { passive: false });
    background.addEventListener("mousemove", handleMouseMoveOrKey, { passive: true });
    background.addEventListener("mouseleave", handleMouseLeave, { passive: true });
  } else {
    const handleTouchStart = (e: TouchEvent) => {
      if (isDragging) return;
      const media = getMediaElement();
      if (!media || media.style.cursor === "move") return;
      const touch = e.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      startPositionY = parsePositionY(media);
      currentPositionY = startPositionY;
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        isLongPressActive = true;
        isDragging = true;
        showHUD(currentPositionY, "长按已激活");
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          navigator.vibrate(15);
        }
      }, 300);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      if (!isDragging) {
        if (longPressTimer) {
          // Track small drift so the drag starts from where the finger is,
          // but a real scroll gesture cancels the pending activation.
          if (Math.hypot(touch.clientX - startX, touch.clientY - startY) > 6) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          } else {
            startY = touch.clientY;
          }
        }
        return;
      }
      e.preventDefault();
      const containerHeight = background.clientHeight || 200;
      const deltaPercent = ((startY - touch.clientY) / containerHeight) * 100 + startPositionY;
      updateElementsPosition(deltaPercent);
      showHUD(currentPositionY, "长按拖拽");
    };

    const handleTouchEnd = (save: boolean) => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (!isDragging) return;
      isDragging = false;
      isLongPressActive = false;
      hideHUD(800);
      if (save) {
        log.info("mobile touch drag finished", { position: currentPositionY });
        savePositionToBlock(currentPositionY);
      }
    };
    const onTouchEnd = () => handleTouchEnd(true);
    const onTouchCancel = () => handleTouchEnd(false);

    background.addEventListener("touchstart", handleTouchStart, { passive: true });
    background.addEventListener("touchmove", handleTouchMove, { passive: false });
    background.addEventListener("touchend", onTouchEnd);
    background.addEventListener("touchcancel", onTouchCancel);
    removeTouchHandlers = () => {
      background.removeEventListener("touchstart", handleTouchStart);
      background.removeEventListener("touchmove", handleTouchMove);
      background.removeEventListener("touchend", onTouchEnd);
      background.removeEventListener("touchcancel", onTouchCancel);
    };
  }

  return () => {
    if (longPressTimer) clearTimeout(longPressTimer);
    if (wheelSaveTimer) clearTimeout(wheelSaveTimer);
    if (positionObserverTimer) clearTimeout(positionObserverTimer);
    removeTouchHandlers?.();
    positionObserver.disconnect();
    document.removeEventListener("mouseup", handleNativePositionMouseUp, true);
    background.removeEventListener("click", handleNativeToolbarClick, true);
    background.removeEventListener("mousedown", handleMouseDown);
    background.removeEventListener("wheel", handleWheel);
    background.removeEventListener("mousemove", handleMouseMoveOrKey);
    background.removeEventListener("mouseleave", handleMouseLeave);
    background.style.cursor = "";
    const hud = background.querySelector(".damophus-position-hud");
    hud?.remove();
  };
}
