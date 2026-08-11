import { mount, unmount } from "svelte";
import MobileAgentDropdownBar from "./MobileAgentDropdownBar.svelte";
import type { MobileAgentDropdownBarLabels } from "./mobile-dropdown-types";

type Gesture = {
  id: number;
  startX: number;
  startY: number;
  horizontal: boolean;
};

export type MobileAgentDropdownControllerOptions = {
  labels: MobileAgentDropdownBarLabels;
  closeNative: () => void;
};

const HORIZONTAL_GESTURE_THRESHOLD = 8;

export class MobileAgentDropdownController {
  private model?: HTMLElement;
  private barHost?: HTMLElement;
  private barApp?: ReturnType<typeof mount>;
  private pinned = true;
  private heightDvh = 80;
  private pointerGesture?: Gesture;
  private touchGesture?: Gesture;

  constructor(private readonly options: MobileAgentDropdownControllerOptions) {}

  attach(model: HTMLElement): void {
    if (this.model !== model) {
      this.detachModel();
      this.model = model;
      this.installGestureProtection(model);
    }
    this.ensureBar(model);
    model.style.setProperty("--damophus-agent-dropdown-height", `${this.heightDvh}dvh`);
    model.classList.toggle("damophus-agent-dropdown-pinned", this.pinned);
  }

  prepareForManualClose(): void {
    this.model?.classList.remove("damophus-agent-dropdown-pinned");
  }

  stop(): void {
    this.detachModel();
    if (this.barApp) void unmount(this.barApp);
    this.barApp = undefined;
    this.barHost?.remove();
    this.barHost = undefined;
  }

  private ensureBar(model: HTMLElement): void {
    if (!this.barHost) {
      model.querySelector(":scope > .damophus-agent-dropdown-bar-host")?.remove();
      this.barHost = document.createElement("div");
      this.barHost.className = "damophus-agent-dropdown-bar-host";
      this.barApp = mount(MobileAgentDropdownBar, {
        target: this.barHost,
        props: {
          labels: this.options.labels,
          initialPinned: this.pinned,
          initialHeightDvh: this.heightDvh,
          onPinnedChange: (pinned: boolean) => {
            this.pinned = pinned;
            this.model?.classList.toggle("damophus-agent-dropdown-pinned", pinned);
          },
          onHeightChange: (heightDvh: number) => {
            this.heightDvh = heightDvh;
            this.model?.style.setProperty(
              "--damophus-agent-dropdown-height",
              `${heightDvh}dvh`,
            );
          },
          onClose: () => {
            this.prepareForManualClose();
            this.options.closeNative();
          },
        },
      });
    }
    if (this.barHost.parentElement !== model) model.prepend(this.barHost);
  }

  private installGestureProtection(model: HTMLElement): void {
    model.addEventListener("pointerdown", this.handlePointerDown, true);
    model.addEventListener("pointermove", this.handlePointerMove, true);
    model.addEventListener("pointerup", this.handlePointerEnd, true);
    model.addEventListener("pointercancel", this.handlePointerEnd, true);
    model.addEventListener("touchstart", this.handleTouchStart, {capture: true, passive: true});
    model.addEventListener("touchmove", this.handleTouchMove, {capture: true, passive: false});
    model.addEventListener("touchend", this.handleTouchEnd, true);
    model.addEventListener("touchcancel", this.handleTouchEnd, true);
    document.addEventListener("click", this.handleNativeCloseClick, true);
  }

  private detachModel(): void {
    const model = this.model;
    if (!model) return;
    model.removeEventListener("pointerdown", this.handlePointerDown, true);
    model.removeEventListener("pointermove", this.handlePointerMove, true);
    model.removeEventListener("pointerup", this.handlePointerEnd, true);
    model.removeEventListener("pointercancel", this.handlePointerEnd, true);
    model.removeEventListener("touchstart", this.handleTouchStart, true);
    model.removeEventListener("touchmove", this.handleTouchMove, true);
    model.removeEventListener("touchend", this.handleTouchEnd, true);
    model.removeEventListener("touchcancel", this.handleTouchEnd, true);
    document.removeEventListener("click", this.handleNativeCloseClick, true);
    model.classList.remove("damophus-agent-dropdown-pinned");
    model.style.removeProperty("--damophus-agent-dropdown-height");
    this.pointerGesture = undefined;
    this.touchGesture = undefined;
    this.model = undefined;
  }

  private readonly handleNativeCloseClick = (event: MouseEvent): void => {
    const target = event.target instanceof Element ? event.target : undefined;
    if (target?.closest("#modelClose")) this.prepareForManualClose();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.pinned || event.pointerType === "mouse") return;
    this.pointerGesture = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      horizontal: false,
    };
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const gesture = this.pointerGesture;
    if (!this.pinned || !gesture || gesture.id !== event.pointerId) return;
    this.updateGesture(gesture, event.clientX, event.clientY);
    if (gesture.horizontal) this.blockGesture(event);
  };

  private readonly handlePointerEnd = (event: PointerEvent): void => {
    const gesture = this.pointerGesture;
    if (!gesture || gesture.id !== event.pointerId) return;
    if (this.pinned && gesture.horizontal) this.blockGesture(event);
    this.pointerGesture = undefined;
  };

  private readonly handleTouchStart = (event: TouchEvent): void => {
    if (!this.pinned || event.touches.length !== 1) return;
    const touch = event.touches[0];
    this.touchGesture = {
      id: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      horizontal: false,
    };
  };

  private readonly handleTouchMove = (event: TouchEvent): void => {
    const gesture = this.touchGesture;
    if (!this.pinned || !gesture) return;
    const touch = [...event.touches].find((item) => item.identifier === gesture.id);
    if (!touch) return;
    this.updateGesture(gesture, touch.clientX, touch.clientY);
    if (gesture.horizontal) this.blockGesture(event);
  };

  private readonly handleTouchEnd = (event: TouchEvent): void => {
    const gesture = this.touchGesture;
    if (!gesture) return;
    if (this.pinned && gesture.horizontal) this.blockGesture(event);
    this.touchGesture = undefined;
  };

  private updateGesture(gesture: Gesture, x: number, y: number): void {
    const deltaX = Math.abs(x - gesture.startX);
    const deltaY = Math.abs(y - gesture.startY);
    if (deltaX >= HORIZONTAL_GESTURE_THRESHOLD && deltaX > deltaY) {
      gesture.horizontal = true;
    }
  }

  private blockGesture(event: Event): void {
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  }
}
