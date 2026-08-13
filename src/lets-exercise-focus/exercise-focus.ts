import { normalizeSiyuanBlockTypes } from "@/libs/siyuan-block-types";

export const EXERCISE_FOCUS_STYLE_ID = "damophus-exercise-focus-style";
export const EXERCISE_CONTAINER_ATTRIBUTE = "data-damophus-exercise-focus";
export const EXERCISE_VISIBILITY_ATTRIBUTE = "data-damophus-exercise-visibility";

const EDITOR_SELECTOR = ".protyle-wysiwyg";
const BLOCK_SELECTOR = "[data-node-id]";
const QUOTE_SELECTOR = '[data-node-id][data-type="NodeBlockquote"]';
const HEADING_SELECTOR = '[data-node-id][data-type="NodeHeading"]';

export interface ExerciseFocusSettings {
  headingText: string;
  headingLevel: string;
  visibleBlockTypes: string[];
  blurRadius: number;
}

export const DEFAULT_EXERCISE_FOCUS_SETTINGS: ExerciseFocusSettings = {
  headingText: "\u4e60\u9898",
  headingLevel: "h6",
  visibleBlockTypes: ["NodeCodeBlock"],
  blurRadius: 5,
};

function normalizeText(value: string): string {
  return value.replace(/[\u200B-\u200D\uFEFF]/gu, "").replace(/\s+/gu, " ").trim();
}

function normalizeSettings(input: Partial<ExerciseFocusSettings>): ExerciseFocusSettings {
  const blurRadius = Number(input.blurRadius);
  return {
    headingText: normalizeText(input.headingText ?? DEFAULT_EXERCISE_FOCUS_SETTINGS.headingText),
    headingLevel: /^h[1-6]$/u.test(input.headingLevel ?? "")
      ? input.headingLevel!
      : DEFAULT_EXERCISE_FOCUS_SETTINGS.headingLevel,
    visibleBlockTypes: normalizeSiyuanBlockTypes(input.visibleBlockTypes, DEFAULT_EXERCISE_FOCUS_SETTINGS.visibleBlockTypes),
    blurRadius: Number.isFinite(blurRadius) ? Math.min(20, Math.max(1, blurRadius)) : DEFAULT_EXERCISE_FOCUS_SETTINGS.blurRadius,
  };
}

function isMatchingHeading(element: HTMLElement, settings: ExerciseFocusSettings): boolean {
  if (!element.matches(HEADING_SELECTOR)) return false;
  const level = element.dataset.subtype || [...element.classList].find((name) => /^h[1-6]$/u.test(name));
  return level === settings.headingLevel && normalizeText(element.textContent ?? "") === settings.headingText;
}

function directContentBlocks(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)].filter((block) =>
    block.parentElement?.closest<HTMLElement>(BLOCK_SELECTOR) === container,
  );
}

function clearContainer(container: HTMLElement): void {
  container.removeAttribute(EXERCISE_CONTAINER_ATTRIBUTE);
  container.querySelectorAll<HTMLElement>(`[${EXERCISE_VISIBILITY_ATTRIBUTE}]`)
    .forEach((block) => {
      block.removeAttribute(EXERCISE_VISIBILITY_ATTRIBUTE);
      block.removeAttribute("data-damophus-exercise-hovered");
    });
}

export function applyExerciseFocus(root: ParentNode, input: Partial<ExerciseFocusSettings> = {}): void {
  const settings = normalizeSettings(input);
  const visibleBlockTypes = new Set(settings.visibleBlockTypes);
  root.querySelectorAll<HTMLElement>(QUOTE_SELECTOR).forEach((container) => {
    clearContainer(container);
    const blocks = directContentBlocks(container);
    const heading = blocks.find((block) => isMatchingHeading(block, settings));
    if (!heading) return;

    container.setAttribute(EXERCISE_CONTAINER_ATTRIBUTE, "true");
    blocks.forEach((block) => {
      const visible = block === heading || visibleBlockTypes.has(block.dataset.type ?? "");
      block.setAttribute(EXERCISE_VISIBILITY_ATTRIBUTE, visible ? "visible" : "hidden");
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

function createStyles(targetDocument: Document, blurRadius: number): HTMLStyleElement {
  const style = targetDocument.createElement("style");
  style.id = EXERCISE_FOCUS_STYLE_ID;
  style.textContent = `
[${EXERCISE_CONTAINER_ATTRIBUTE}="true"] [${EXERCISE_VISIBILITY_ATTRIBUTE}="hidden"] {
  filter: blur(${blurRadius}px);
  transition: filter 140ms ease;
}
[${EXERCISE_CONTAINER_ATTRIBUTE}="true"] [${EXERCISE_VISIBILITY_ATTRIBUTE}="hidden"]:hover,
[${EXERCISE_CONTAINER_ATTRIBUTE}="true"] [${EXERCISE_VISIBILITY_ATTRIBUTE}="hidden"][data-damophus-exercise-hovered="true"],
[${EXERCISE_CONTAINER_ATTRIBUTE}="true"] [${EXERCISE_VISIBILITY_ATTRIBUTE}="hidden"]:focus-within {
  filter: none;
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
    this.style = createStyles(this.targetDocument, this.settings.blurRadius);
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
      this.hoverListenersInstalled = false;
    }
    this.targetDocument.querySelectorAll<HTMLElement>(`[${EXERCISE_CONTAINER_ATTRIBUTE}]`)
      .forEach(clearContainer);
  }

  private installHoverListeners(): void {
    this.targetDocument.addEventListener("mouseover", this.handleMouseOver, true);
    this.targetDocument.addEventListener("mouseout", this.handleMouseOut, true);
    this.hoverListenersInstalled = true;
  }

  private readonly handleMouseOver = (event: MouseEvent): void => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>(`[${EXERCISE_VISIBILITY_ATTRIBUTE}="hidden"]`)
      : undefined;
    target?.setAttribute("data-damophus-exercise-hovered", "true");
  };

  private readonly handleMouseOut = (event: MouseEvent): void => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>(`[${EXERCISE_VISIBILITY_ATTRIBUTE}="hidden"]`)
      : undefined;
    if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return;
    target.removeAttribute("data-damophus-exercise-hovered");
  };

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
