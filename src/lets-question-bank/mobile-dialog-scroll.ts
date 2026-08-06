const MOBILE_DIALOG_GESTURE_EVENTS = [
  "touchstart",
  "touchmove",
  "touchend",
  "pointerdown",
  "pointermove",
  "pointerup",
] as const;

/** Keep question-bank gestures from reaching Siyuan's mobile dialog/dock handlers. */
export function isolateMobileDialogGestures(root: HTMLElement): () => void {
  const stopPropagation = (event: Event): void => event.stopPropagation();
  for (const type of MOBILE_DIALOG_GESTURE_EVENTS) {
    root.addEventListener(type, stopPropagation, { capture: true, passive: true });
  }
  return () => {
    for (const type of MOBILE_DIALOG_GESTURE_EVENTS) {
      root.removeEventListener(type, stopPropagation, { capture: true });
    }
  };
}
