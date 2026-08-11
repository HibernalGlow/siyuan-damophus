const PORTALED_SELECT_GESTURE_EVENTS = [
	"touchstart",
	"touchmove",
	"touchend",
	"touchcancel",
	"wheel",
] as const;

/** Keep gestures inside a portaled Select from reaching SiYuan's Dock handlers. */
export function isolatePortaledSelectGestures(node: HTMLElement): { destroy(): void } {
	const stopPropagation = (event: Event): void => event.stopPropagation();
	for (const type of PORTALED_SELECT_GESTURE_EVENTS) {
		node.addEventListener(type, stopPropagation, { passive: true });
	}
	return {
		destroy(): void {
			for (const type of PORTALED_SELECT_GESTURE_EVENTS) {
				node.removeEventListener(type, stopPropagation);
			}
		},
	};
}
