import type { BlockBreadcrumbItem } from "@/api";

export type BreadcrumbOverflowPriority = "head" | "tail";
export type BreadcrumbTextMode = "characters" | "full" | "width";

export interface BreadcrumbTextDisplay {
  mode: BreadcrumbTextMode;
  maxCharacters: number;
  maxWidth: number;
}

export interface ScrollableBreadcrumbOptions {
  priority: BreadcrumbOverflowPriority;
  onNavigate?: (id: string) => void;
}

export function normalizeBreadcrumbPriority(value: unknown): BreadcrumbOverflowPriority {
  return value === "head" ? "head" : "tail";
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function normalizeBreadcrumbTextDisplay(
  mode: unknown,
  maxCharacters: unknown,
  maxWidth: unknown,
): BreadcrumbTextDisplay {
  return {
    mode: mode === "characters" || mode === "width" ? mode : "full",
    maxCharacters: boundedInteger(maxCharacters, 16, 4, 100),
    maxWidth: boundedInteger(maxWidth, 160, 64, 480),
  };
}

export function visibleBreadcrumbText(name: string, display: BreadcrumbTextDisplay): string {
  if (display.mode !== "characters") return name;
  const characters = Array.from(name);
  return characters.length > display.maxCharacters
    ? `${characters.slice(0, display.maxCharacters).join("")}...`
    : name;
}

export function breadcrumbIcon(type: string, subType: string): string {
  switch (type) {
    case "NodeDocument": return "iconFile";
    case "NodeThematicBreak": return "iconLine";
    case "NodeParagraph": return "iconParagraph";
    case "NodeHeading": return subType ? `icon${subType.toUpperCase()}` : "iconHeadings";
    case "NodeBlockquote": return "iconQuote";
    case "NodeCallout": return "iconCallout";
    case "NodeList": return subType === "t" ? "iconCheck" : subType === "o" ? "iconOrderedList" : "iconList";
    case "NodeListItem": return "iconListItem";
    case "NodeCodeBlock":
    case "NodeYamlFrontMatter": return "iconCode";
    case "NodeTable": return "iconTable";
    case "NodeBlockQueryEmbed": return "iconSQL";
    case "NodeSuperBlock": return "iconSuper";
    case "NodeMathBlock": return "iconMath";
    case "NodeHTMLBlock": return "iconHTML5";
    case "NodeWidget": return "iconBoth";
    case "NodeIFrame": return "iconGlobe";
    case "NodeVideo": return "iconVideo";
    case "NodeAudio": return "iconRecord";
    case "NodeAttributeView": return "iconDatabase";
    default: return "iconParagraph";
  }
}

export class ScrollableBreadcrumb {
  private readonly originalHTML: string;
  private readonly resizeObserver?: ResizeObserver;
  private readonly mutationObserver?: MutationObserver;
  private readonly onNavigate?: (id: string) => void;
  private frame?: number;
  private priority: BreadcrumbOverflowPriority;

  constructor(
    private readonly element: HTMLElement,
    options: ScrollableBreadcrumbOptions,
  ) {
    this.originalHTML = element.innerHTML;
    this.priority = options.priority;
    this.onNavigate = options.onNavigate;
    element.classList.add("damophus-scrollable-breadcrumb");
    element.addEventListener("click", this.handleClick);

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.scheduleAlignment());
      this.resizeObserver.observe(element);
    }
    if (typeof MutationObserver !== "undefined") {
      this.mutationObserver = new MutationObserver(() => this.scheduleAlignment());
      this.mutationObserver.observe(element, { childList: true, subtree: true });
    }
    this.scheduleAlignment();
  }

  setPriority(priority: BreadcrumbOverflowPriority): void {
    this.priority = priority;
    this.scheduleAlignment();
  }

  renderMobileItems(
    items: BlockBreadcrumbItem[],
    activeId: string | undefined,
    expandLabel: string,
    textDisplay: BreadcrumbTextDisplay = normalizeBreadcrumbTextDisplay("full", 16, 160),
  ): void {
    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
      const pathItem = document.createElement("span");
      pathItem.className = "protyle-breadcrumb__item damophus-mobile-breadcrumb__item";
      if (item.id === activeId) pathItem.classList.add("protyle-breadcrumb__item--active");
      pathItem.dataset.nodeId = item.id;
      pathItem.setAttribute("role", "button");
      pathItem.setAttribute("tabindex", "-1");
      pathItem.setAttribute("aria-label", item.name);

      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.classList.add("popover__block");
      icon.dataset.id = item.id;
      const iconUse = document.createElementNS("http://www.w3.org/2000/svg", "use");
      iconUse.setAttribute("href", `#${breadcrumbIcon(item.type, item.subType)}`);
      icon.append(iconUse);

      const text = document.createElement("span");
      text.className = "protyle-breadcrumb__text";
      text.title = item.name;
      text.textContent = visibleBreadcrumbText(item.name, textDisplay);
      if (textDisplay.mode === "width") {
        text.classList.add("damophus-mobile-breadcrumb__text--width");
        text.style.maxWidth = `${textDisplay.maxWidth}px`;
      }
      pathItem.append(icon, text);
      fragment.append(pathItem);

      if (index < items.length - 1) {
        const arrow = document.createElement("span");
        arrow.className = "protyle-breadcrumb__arrow ariaLabel";
        arrow.setAttribute("role", "button");
        arrow.setAttribute("tabindex", "-1");
        arrow.setAttribute("aria-label", expandLabel);
        const arrowIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const arrowUse = document.createElementNS("http://www.w3.org/2000/svg", "use");
        arrowUse.setAttribute("href", "#iconRight");
        arrowIcon.append(arrowUse);
        arrow.append(arrowIcon);
        fragment.append(arrow);
      }
    });

    this.element.dataset.damophusMobileBreadcrumb = "true";
    this.element.replaceChildren(fragment);
    this.scheduleAlignment();
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
    this.element.removeEventListener("click", this.handleClick);
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    if (this.element.dataset.damophusMobileBreadcrumb === "true") {
      this.element.innerHTML = this.originalHTML;
      delete this.element.dataset.damophusMobileBreadcrumb;
    }
    this.element.classList.remove("damophus-scrollable-breadcrumb");
    this.element.scrollLeft = 0;
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target instanceof Element ? event.target : undefined;
    if (!target || target.closest(".protyle-breadcrumb__arrow")) return;
    const item = target.closest<HTMLElement>(".protyle-breadcrumb__item[data-node-id]");
    if (!item || !this.element.contains(item)) return;
    event.preventDefault();
    event.stopPropagation();
    this.onNavigate?.(item.dataset.nodeId!);
  };

  private scheduleAlignment(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      if (this.priority === "head") {
        this.element.scrollLeft = 0;
        return;
      }
      const items = this.element.querySelectorAll<HTMLElement>(".protyle-breadcrumb__item");
      const tail = items.item(items.length - 1);
      this.element.scrollLeft = tail
        ? Math.max(0, tail.offsetLeft + tail.offsetWidth - this.element.clientWidth)
        : this.element.scrollWidth - this.element.clientWidth;
    });
  }
}
