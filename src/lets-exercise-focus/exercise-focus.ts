import { normalizeSiyuanBlockTypes } from "@/libs/siyuan-block-types";

export const EXERCISE_FOCUS_STYLE_ID = "damophus-exercise-focus-style";
export const EXERCISE_CONTAINER_ATTRIBUTE = "data-damophus-exercise-focus";
export const EXERCISE_VISIBILITY_ATTRIBUTE = "data-damophus-exercise-visibility";
export const EXERCISE_MASK_GROUP_ATTRIBUTE = "data-damophus-exercise-mask-group";
export const EXERCISE_MASK_ROLE_ATTRIBUTE = "data-damophus-exercise-mask-role";
export const EXERCISE_REVEALED_ATTRIBUTE = "data-damophus-exercise-revealed";
export const EXERCISE_EDITING_ATTRIBUTE = "data-damophus-exercise-editing";

const EDITOR_SELECTOR = ".protyle-wysiwyg";
const BLOCK_SELECTOR = "[data-node-id]";
const QUOTE_SELECTOR = '[data-node-id][data-type="NodeBlockquote"]';
const QUESTION_CALLOUT_SELECTOR = '[data-node-id][data-type="NodeCallout"][data-subtype="QUESTION"]';
const HEADING_SELECTOR = '[data-node-id][data-type="NodeHeading"]';

export interface ExerciseFocusSettings {
  headingText: string;
  headingLevel: string;
  visibleBlockTypes: string[];
  maskHeight: number;
}

export const DEFAULT_EXERCISE_FOCUS_SETTINGS: ExerciseFocusSettings = {
  headingText: "\u4e60\u9898",
  headingLevel: "h6",
  visibleBlockTypes: ["NodeCodeBlock"],
  maskHeight: 72,
};

function normalizeText(value: string): string {
  return value.replace(/[\u200B-\u200D\uFEFF]/gu, "").replace(/\s+/gu, " ").trim();
}

function normalizeSettings(input: Partial<ExerciseFocusSettings>): ExerciseFocusSettings {
  const maskHeight = Number(input.maskHeight);
  return {
    headingText: normalizeText(input.headingText ?? DEFAULT_EXERCISE_FOCUS_SETTINGS.headingText),
    headingLevel: /^h[1-6]$/u.test(input.headingLevel ?? "")
      ? input.headingLevel!
      : DEFAULT_EXERCISE_FOCUS_SETTINGS.headingLevel,
    visibleBlockTypes: normalizeSiyuanBlockTypes(input.visibleBlockTypes, DEFAULT_EXERCISE_FOCUS_SETTINGS.visibleBlockTypes),
    maskHeight: Number.isFinite(maskHeight) ? Math.min(160, Math.max(48, maskHeight)) : DEFAULT_EXERCISE_FOCUS_SETTINGS.maskHeight,
  };
}

function isMatchingHeading(element: HTMLElement, settings: ExerciseFocusSettings): boolean {
  if (!element.matches(HEADING_SELECTOR)) return false;
  const level = element.dataset.subtype || [...element.classList].find((name) => /^h[1-6]$/u.test(name));
  return level === settings.headingLevel && normalizeText(element.textContent ?? "") === settings.headingText;
}

function isQuestionCallout(element: HTMLElement): boolean {
  return element.matches(QUESTION_CALLOUT_SELECTOR);
}

function directContentBlocks(container: HTMLElement): HTMLElement[] {
  const contentRoot = isQuestionCallout(container)
    ? container.querySelector<HTMLElement>(":scope > .callout-content")
    : container;
  if (!contentRoot) return [];
  return [...contentRoot.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)].filter((block) =>
    block.parentElement?.closest<HTMLElement>(BLOCK_SELECTOR) === container,
  );
}

function clearContainer(container: HTMLElement): void {
  container.removeAttribute(EXERCISE_CONTAINER_ATTRIBUTE);
  container.querySelectorAll<HTMLElement>(`[${EXERCISE_VISIBILITY_ATTRIBUTE}]`)
    .forEach((block) => {
      block.removeAttribute(EXERCISE_VISIBILITY_ATTRIBUTE);
      block.removeAttribute(EXERCISE_MASK_GROUP_ATTRIBUTE);
      block.removeAttribute(EXERCISE_MASK_ROLE_ATTRIBUTE);
      block.removeAttribute(EXERCISE_REVEALED_ATTRIBUTE);
      block.removeAttribute(EXERCISE_EDITING_ATTRIBUTE);
      block.removeAttribute("data-damophus-exercise-hovered");
    });
}

export function applyExerciseFocus(root: ParentNode, input: Partial<ExerciseFocusSettings> = {}): void {
  const settings = normalizeSettings(input);
  const visibleBlockTypes = new Set(settings.visibleBlockTypes);
  root.querySelectorAll<HTMLElement>(`${QUOTE_SELECTOR}, ${QUESTION_CALLOUT_SELECTOR}`).forEach((container) => {
    const previousMaskStates = new Map<string, { revealed: boolean; editing: boolean }>();
    container.querySelectorAll<HTMLElement>(`[${EXERCISE_MASK_GROUP_ATTRIBUTE}]`).forEach((block) => {
      const group = block.getAttribute(EXERCISE_MASK_GROUP_ATTRIBUTE);
      if (!group) return;
      const previous = previousMaskStates.get(group) ?? { revealed: false, editing: false };
      previous.revealed ||= block.getAttribute(EXERCISE_REVEALED_ATTRIBUTE) === "true";
      previous.editing ||= block.getAttribute(EXERCISE_EDITING_ATTRIBUTE) === "true";
      previousMaskStates.set(group, previous);
    });
    clearContainer(container);
    const blocks = directContentBlocks(container);
    const questionCallout = isQuestionCallout(container);
    const heading = questionCallout ? undefined : blocks.find((block) => isMatchingHeading(block, settings));
    if (!questionCallout && !heading) return;

    container.setAttribute(EXERCISE_CONTAINER_ATTRIBUTE, "true");
    let maskGroup = 0;
    let previousHidden = false;
    blocks.forEach((block) => {
      const visible = (!questionCallout && block === heading) || visibleBlockTypes.has(block.dataset.type ?? "");
      block.setAttribute(EXERCISE_VISIBILITY_ATTRIBUTE, visible ? "visible" : "hidden");
      if (visible) {
        previousHidden = false;
        return;
      }
      if (!previousHidden) maskGroup += 1;
      block.setAttribute(EXERCISE_MASK_GROUP_ATTRIBUTE, String(maskGroup));
      block.setAttribute(EXERCISE_MASK_ROLE_ATTRIBUTE, previousHidden ? "member" : "lead");
      const previous = previousMaskStates.get(String(maskGroup));
      if (previous?.revealed) block.setAttribute(EXERCISE_REVEALED_ATTRIBUTE, "true");
      if (previous?.editing) block.setAttribute(EXERCISE_EDITING_ATTRIBUTE, "true");
      previousHidden = true;
    });
  });
}

function rootsFromMutations(records: readonly MutationRecord[]): HTMLElement[] {
  const roots = new Set<HTMLElement>();
  const add = (node: Node | null) => {
    const element = node instanceof Element ? node : node?.parentElement;
    const root = element?.closest<HTMLElement>(EDITOR_SELECTOR);
    if (root) roots.add(root);
  };
  records.forEach((record) => {
    add(record.target);
    record.addedNodes.forEach(add);
    record.removedNodes.forEach(add);
  });
  return [...roots];
}

function createStyles(targetDocument: Document, maskHeight: number): HTMLStyleElement {
  const style = targetDocument.createElement("style");
  style.id = EXERCISE_FOCUS_STYLE_ID;
  style.textContent = `
[${EXERCISE_CONTAINER_ATTRIBUTE}="true"] [${EXERCISE_VISIBILITY_ATTRIBUTE}="hidden"][${EXERCISE_MASK_ROLE_ATTRIBUTE}="lead"]:not([${EXERCISE_REVEALED_ATTRIBUTE}="true"]) {
  position: relative;
  box-sizing: border-box;
  height: ${maskHeight}px !important;
  min-height: ${maskHeight}px !important;
  max-height: ${maskHeight}px !important;
  overflow: hidden !important;
  border: 1px dashed color-mix(in srgb, var(--b3-theme-primary) 38%, var(--b3-border-color)) !important;
  border-radius: var(--b3-border-radius, 6px);
  color: transparent !important;
  background: color-mix(in srgb, var(--b3-theme-surface) 82%, var(--b3-theme-background)) !important;
  cursor: pointer;
  user-select: none;
  transition: border-color 140ms ease, background-color 140ms ease;
}
[${EXERCISE_CONTAINER_ATTRIBUTE}="true"] [${EXERCISE_VISIBILITY_ATTRIBUTE}="hidden"][${EXERCISE_MASK_ROLE_ATTRIBUTE}="lead"]:not([${EXERCISE_REVEALED_ATTRIBUTE}="true"]) > * {
  visibility: hidden !important;
}
[${EXERCISE_CONTAINER_ATTRIBUTE}="true"] [${EXERCISE_VISIBILITY_ATTRIBUTE}="hidden"][${EXERCISE_MASK_ROLE_ATTRIBUTE}="lead"]:not([${EXERCISE_REVEALED_ATTRIBUTE}="true"])::after {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: color-mix(in srgb, var(--b3-theme-primary) 72%, var(--b3-theme-on-surface-light));
  font-size: 18px;
  letter-spacing: 6px;
  content: "\u00b7\u00b7\u00b7";
}
[${EXERCISE_CONTAINER_ATTRIBUTE}="true"] [${EXERCISE_VISIBILITY_ATTRIBUTE}="hidden"][${EXERCISE_MASK_ROLE_ATTRIBUTE}="member"]:not([${EXERCISE_REVEALED_ATTRIBUTE}="true"]) {
  display: none !important;
}
[${EXERCISE_CONTAINER_ATTRIBUTE}="true"] [${EXERCISE_VISIBILITY_ATTRIBUTE}="hidden"][${EXERCISE_MASK_ROLE_ATTRIBUTE}="lead"][${EXERCISE_REVEALED_ATTRIBUTE}="true"] {
  min-height: ${maskHeight}px;
}
`;
  targetDocument.head.append(style);
  return style;
}

export class ExerciseFocusController {
  private observer?: MutationObserver;
  private style?: HTMLStyleElement;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private readonly pendingRoots = new Set<HTMLElement>();
  private settings = DEFAULT_EXERCISE_FOCUS_SETTINGS;
  private hoverListenersInstalled = false;

  constructor(private readonly targetDocument: Document = document) {}

  start(input: Partial<ExerciseFocusSettings> = {}): void {
    this.destroy();
    this.settings = normalizeSettings(input);
    if (!this.targetDocument.body) return;
    this.style = createStyles(this.targetDocument, this.settings.maskHeight);
    this.installHoverListeners();
    this.targetDocument.querySelectorAll<HTMLElement>(EDITOR_SELECTOR)
      .forEach((root) => applyExerciseFocus(root, this.settings));

    const MutationObserverConstructor = this.targetDocument.defaultView?.MutationObserver;
    if (!MutationObserverConstructor) return;
    this.observer = new MutationObserverConstructor((records) => this.schedule(rootsFromMutations(records)));
    this.observer.observe(this.targetDocument.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-node-id", "data-type", "data-subtype", "class"],
    });
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    if (this.refreshTimer !== undefined) clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    this.pendingRoots.clear();
    this.style?.remove();
    this.style = undefined;
    if (this.hoverListenersInstalled) {
      this.targetDocument.removeEventListener("mouseover", this.handleMouseOver, true);
      this.targetDocument.removeEventListener("mouseout", this.handleMouseOut, true);
      this.targetDocument.removeEventListener("pointerdown", this.handlePointerDown, true);
      this.hoverListenersInstalled = false;
    }
    this.targetDocument.querySelectorAll<HTMLElement>(`[${EXERCISE_CONTAINER_ATTRIBUTE}]`)
      .forEach(clearContainer);
  }

  private installHoverListeners(): void {
    this.targetDocument.addEventListener("mouseover", this.handleMouseOver, true);
    this.targetDocument.addEventListener("mouseout", this.handleMouseOut, true);
    this.targetDocument.addEventListener("pointerdown", this.handlePointerDown, true);
    this.hoverListenersInstalled = true;
  }

  private readonly handleMouseOver = (event: MouseEvent): void => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>(`[${EXERCISE_VISIBILITY_ATTRIBUTE}="hidden"]`)
      : undefined;
    if (target) this.setGroupRevealed(target, true);
  };

  private readonly handleMouseOut = (event: MouseEvent): void => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>(`[${EXERCISE_VISIBILITY_ATTRIBUTE}="hidden"]`)
      : undefined;
    if (!target) return;
    const relatedBlock = event.relatedTarget instanceof Element
      ? event.relatedTarget.closest<HTMLElement>(`[${EXERCISE_MASK_GROUP_ATTRIBUTE}]`)
      : undefined;
    if (relatedBlock && this.sameMaskGroup(target, relatedBlock)) return;
    if (target.getAttribute(EXERCISE_EDITING_ATTRIBUTE) === "true" || this.isGroupFocused(target)) return;
    this.setGroupRevealed(target, false);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>(`[${EXERCISE_MASK_GROUP_ATTRIBUTE}]`)
      : undefined;
    if (target) {
      this.setGroupRevealed(target, true);
      this.setGroupEditing(target, true);
      return;
    }
    this.targetDocument.querySelectorAll<HTMLElement>(`[${EXERCISE_EDITING_ATTRIBUTE}="true"]`)
      .forEach((block) => {
        this.setGroupEditing(block, false);
        this.setGroupRevealed(block, false);
      });
  };

  private sameMaskGroup(left: HTMLElement, right: HTMLElement): boolean {
    return left.closest(`[${EXERCISE_CONTAINER_ATTRIBUTE}]`) === right.closest(`[${EXERCISE_CONTAINER_ATTRIBUTE}]`)
      && left.getAttribute(EXERCISE_MASK_GROUP_ATTRIBUTE) === right.getAttribute(EXERCISE_MASK_GROUP_ATTRIBUTE);
  }

  private setGroupRevealed(target: HTMLElement, revealed: boolean): void {
    const container = target.closest<HTMLElement>(`[${EXERCISE_CONTAINER_ATTRIBUTE}]`);
    const group = target.getAttribute(EXERCISE_MASK_GROUP_ATTRIBUTE);
    if (!container || !group) return;
    container.querySelectorAll<HTMLElement>(`[${EXERCISE_MASK_GROUP_ATTRIBUTE}]`)
      .forEach((block) => {
        if (block.getAttribute(EXERCISE_MASK_GROUP_ATTRIBUTE) !== group) return;
        if (revealed) block.setAttribute(EXERCISE_REVEALED_ATTRIBUTE, "true");
        else block.removeAttribute(EXERCISE_REVEALED_ATTRIBUTE);
      });
  }

  private setGroupEditing(target: HTMLElement, editing: boolean): void {
    const container = target.closest<HTMLElement>(`[${EXERCISE_CONTAINER_ATTRIBUTE}]`);
    const group = target.getAttribute(EXERCISE_MASK_GROUP_ATTRIBUTE);
    if (!container || !group) return;
    container.querySelectorAll<HTMLElement>(`[${EXERCISE_MASK_GROUP_ATTRIBUTE}]`)
      .forEach((block) => {
        if (block.getAttribute(EXERCISE_MASK_GROUP_ATTRIBUTE) !== group) return;
        if (editing) block.setAttribute(EXERCISE_EDITING_ATTRIBUTE, "true");
        else block.removeAttribute(EXERCISE_EDITING_ATTRIBUTE);
      });
  }

  private isGroupFocused(target: HTMLElement): boolean {
    const active = this.targetDocument.activeElement;
    const activeBlock = active instanceof Element
      ? active.closest<HTMLElement>(`[${EXERCISE_MASK_GROUP_ATTRIBUTE}]`)
      : undefined;
    return Boolean(activeBlock && this.sameMaskGroup(target, activeBlock));
  }

  private schedule(roots: readonly HTMLElement[]): void {
    roots.forEach((root) => this.pendingRoots.add(root));
    if (this.pendingRoots.size === 0 || this.refreshTimer !== undefined) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      const pendingRoots = [...this.pendingRoots];
      this.pendingRoots.clear();
      pendingRoots.filter((root) => root.isConnected).forEach((root) => applyExerciseFocus(root, this.settings));
    }, 0);
  }
}
