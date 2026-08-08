import {
  TOPIC_RELATION_SURFACE_ATTRIBUTE,
  type TopicRelationEntry,
  type TopicRelationGroup,
} from "./topic-relations";
import {
  createNativeBlockRef,
  type TopicRelationPanelGroup,
} from "./topic-relation-dom";

export interface TopicRelationPanelLabels {
  topicNotes: string;
  otherTopicNotes: string;
  relatedQuestions: string;
  empty: string;
  pin: string;
  unpin: string;
  close: string;
}

export interface TopicRelationPanelOptions {
  mobile: boolean;
  mobileHeight: number;
  nativeHover: boolean;
  labels: TopicRelationPanelLabels;
}

function releaseEditorFocus(): void {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  window.getSelection()?.removeAllRanges();
}

function iconButton(icon: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "damophus-topic-relations__icon-button ariaLabel";
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML = `<svg><use xlink:href="#${icon}"></use></svg>`;
  return button;
}

function createRelationList(
  entries: readonly TopicRelationEntry[],
  nativeHover: boolean,
  emptyLabel: string,
): HTMLElement {
  const list = document.createElement("ul");
  list.className = "damophus-topic-relations__list";
  if (entries.length === 0) {
    const item = document.createElement("li");
    item.className = "damophus-topic-relations__empty";
    item.textContent = emptyLabel;
    list.append(item);
    return list;
  }
  entries.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "damophus-topic-relations__list-item";
    item.append(createNativeBlockRef(entry, nativeHover));
    if (entry.hpath) {
      const path = document.createElement("span");
      path.className = "damophus-topic-relations__path";
      path.textContent = entry.hpath;
      item.append(path);
    }
    list.append(item);
  });
  return list;
}

function createPanelGroup(
  label: string,
  entries: readonly TopicRelationEntry[],
  options: TopicRelationPanelOptions,
  selected: boolean,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "damophus-topic-relations__panel-group";
  if (selected) section.dataset.selected = "true";
  const heading = document.createElement("h3");
  heading.textContent = `${label} (${entries.length})`;
  section.append(heading, createRelationList(entries, options.nativeHover, options.labels.empty));
  return section;
}

export class TopicRelationPanel {
  private root?: HTMLElement;
  private panel?: HTMLElement;
  private pinned = false;
  private anchor?: HTMLElement;
  private readonly handleDocumentPointer = (event: MouseEvent): void => {
    if (this.pinned || !this.root || !this.anchor) return;
    if (event.target instanceof Node && (this.root.contains(event.target) || this.anchor.contains(event.target))) return;
    this.close();
  };
  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") this.close();
  };
  private readonly handleResize = (): void => this.position();

  open(
    anchor: HTMLElement,
    group: TopicRelationGroup,
    hostBlockId: string,
    preferredGroup: TopicRelationPanelGroup | undefined,
    options: TopicRelationPanelOptions,
  ): void {
    this.close();
    if (options.mobile) releaseEditorFocus();
    this.anchor = anchor;
    this.pinned = false;
    const root = document.createElement("div");
    root.className = options.mobile
      ? "damophus-topic-relations__overlay damophus-topic-relations__overlay--mobile"
      : "damophus-topic-relations__overlay";
    root.setAttribute(TOPIC_RELATION_SURFACE_ATTRIBUTE, "true");
    const panel = document.createElement("div");
    panel.className = options.mobile
      ? "damophus-topic-relations__panel damophus-topic-relations__panel--mobile"
      : "damophus-topic-relations__panel";
    panel.setAttribute("role", options.mobile ? "dialog" : "region");
    panel.setAttribute("aria-modal", options.mobile ? "true" : "false");
    if (options.mobile) panel.style.setProperty("--damophus-topic-mobile-height", `${options.mobileHeight}dvh`);

    const header = document.createElement("header");
    header.className = "damophus-topic-relations__panel-header";
    const title = document.createElement("h2");
    title.textContent = group.label;
    const actions = document.createElement("div");
    actions.className = "damophus-topic-relations__panel-actions";
    if (!options.mobile) {
      const pin = iconButton("iconPin", options.labels.pin);
      pin.setAttribute("aria-pressed", "false");
      pin.addEventListener("click", () => {
        this.pinned = !this.pinned;
        pin.setAttribute("aria-pressed", String(this.pinned));
        pin.setAttribute("aria-label", this.pinned ? options.labels.unpin : options.labels.pin);
        pin.title = this.pinned ? options.labels.unpin : options.labels.pin;
      });
      actions.append(pin);
    }
    const close = iconButton("iconClose", options.labels.close);
    close.addEventListener("click", () => this.close());
    actions.append(close);
    header.append(title, actions);

    const content = document.createElement("div");
    content.className = "damophus-topic-relations__panel-content";
    const notes = group.notes.filter((entry) => entry.blockId !== hostBlockId);
    const questions = group.questions.filter((entry) => entry.blockId !== hostBlockId);
    content.append(
      createPanelGroup(
        hostBlockId && group.notes.some((entry) => entry.blockId === hostBlockId)
          ? options.labels.otherTopicNotes
          : options.labels.topicNotes,
        notes,
        options,
        preferredGroup === "notes",
      ),
      createPanelGroup(
        options.labels.relatedQuestions,
        questions,
        options,
        preferredGroup === "questions",
      ),
    );
    panel.append(header, content);
    root.append(panel);
    document.body.append(root);
    this.root = root;
    this.panel = panel;
    if (options.mobile) root.addEventListener("click", (event) => {
      if (event.target === root) this.close();
    });
    document.addEventListener("mousedown", this.handleDocumentPointer, true);
    document.addEventListener("keydown", this.handleKeydown, true);
    window.addEventListener("resize", this.handleResize);
    this.position();
    const selected = content.querySelector<HTMLElement>('[data-selected="true"]');
    selected?.scrollIntoView({ block: "nearest" });
    close.focus({ preventScroll: true });
  }

  close(): void {
    document.removeEventListener("mousedown", this.handleDocumentPointer, true);
    document.removeEventListener("keydown", this.handleKeydown, true);
    window.removeEventListener("resize", this.handleResize);
    this.root?.remove();
    this.root = undefined;
    this.panel = undefined;
    this.anchor = undefined;
    this.pinned = false;
  }

  destroy(): void {
    this.close();
  }

  private position(): void {
    if (!this.panel || !this.anchor || this.panel.classList.contains("damophus-topic-relations__panel--mobile")) return;
    const anchorRect = this.anchor.getBoundingClientRect();
    const panelRect = this.panel.getBoundingClientRect();
    const margin = 12;
    const left = Math.min(
      Math.max(margin, anchorRect.left),
      Math.max(margin, window.innerWidth - panelRect.width - margin),
    );
    const below = anchorRect.bottom + 6;
    const top = below + panelRect.height <= window.innerHeight - margin
      ? below
      : Math.max(margin, anchorRect.top - panelRect.height - 6);
    this.panel.style.left = `${left}px`;
    this.panel.style.top = `${top}px`;
  }
}
