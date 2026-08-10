import {
  TOPIC_RELATION_MARKER_CLASS,
  type TopicRelationDisplayMode,
  type TopicRelationEntry,
  type TopicRelationGroup,
  type TopicRelationTarget,
  relationEntryLabel,
} from "./topic-relations";

export type TopicRelationPanelGroup = "notes" | "questions";
export type TopicRelationScope = "all" | "document" | "external";

export interface TopicRelationLabels {
  topics: string;
  topicNote: string;
  topicNotes: string;
  otherTopicNotes: string;
  relatedQuestions: string;
  unresolved: string;
  loadFailed: string;
  retry: string;
  openRelations: string;
  more: string;
  all: string;
  currentDocument: string;
  outsideDocument: string;
}

export interface TopicRelationRenderOptions {
  displayMode: TopicRelationDisplayMode;
  nativeHover: boolean;
  labels: TopicRelationLabels;
  error?: string;
  onRetry: () => void;
  onOpen: (
    anchor: HTMLElement,
    group: TopicRelationGroup,
    hostBlockId: string,
    preferredGroup?: TopicRelationPanelGroup,
    scope?: TopicRelationScope,
  ) => void;
}

function preventEditorFocus(element: HTMLElement): void {
  element.addEventListener("pointerdown", (event) => {
    if (event.button === 0) event.preventDefault();
  });
}

function replaceCount(template: string, count: number): string {
  return template.replace("{count}", String(count));
}

export function createNativeBlockRef(
  entry: TopicRelationEntry,
  nativeHover: boolean,
): HTMLSpanElement {
  const link = document.createElement("span");
  link.className = "damophus-topic-relations__native-link";
  link.dataset.type = "block-ref";
  link.dataset.id = entry.blockId;
  link.dataset.subtype = "d";
  link.contentEditable = "false";
  link.tabIndex = 0;
  link.setAttribute("role", "link");
  link.textContent = relationEntryLabel(entry);
  if (entry.hpath) link.title = entry.hpath;
  if (!nativeHover) link.setAttribute("prevent-popover", "true");
  preventEditorFocus(link);
  link.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    link.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
    }));
  });
  return link;
}

function createTopicButton(
  label: string,
  title: string,
  onClick: (button: HTMLButtonElement) => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "damophus-topic-relations__topic-button";
  button.textContent = label;
  button.title = title;
  preventEditorFocus(button);
  button.addEventListener("click", () => onClick(button));
  return button;
}

function createCountButton(
  label: string,
  count: number,
  title: string,
  onClick: (button: HTMLButtonElement) => void,
): HTMLButtonElement | undefined {
  if (count <= 0) return undefined;
  const button = createTopicButton(replaceCount(label, count), title, onClick);
  button.classList.add("damophus-topic-relations__count-button");
  return button;
}

function entriesForScope(
  entries: readonly TopicRelationEntry[],
  target: TopicRelationTarget,
  scope: TopicRelationScope,
): TopicRelationEntry[] {
  if (scope === "all") return [...entries];
  if (!target.documentId) return [];
  return entries.filter((entry) => scope === "document"
    ? entry.rootId === target.documentId
    : entry.rootId !== target.documentId);
}

function appendScopedCountButtons(
  row: HTMLElement,
  entries: readonly TopicRelationEntry[],
  target: TopicRelationTarget,
  labels: TopicRelationLabels,
  onOpen: TopicRelationRenderOptions["onOpen"],
  group: TopicRelationGroup,
  hostBlockId: string,
  preferredGroup: TopicRelationPanelGroup,
): void {
  const availableScopes: Array<{ scope: TopicRelationScope; icon: string; label: string }> = [
    { scope: "all", icon: "iconList", label: labels.all },
    { scope: "document", icon: "iconFile", label: labels.currentDocument },
    { scope: "external", icon: "iconFiles", label: labels.outsideDocument },
  ];
  const documentEntries = entriesForScope(entries, target, "document");
  const externalEntries = entriesForScope(entries, target, "external");
  const scopes = !target.documentId
    ? availableScopes.filter(({ scope }) => scope === "all")
    : documentEntries.length > 0 && externalEntries.length > 0
      ? availableScopes
      : availableScopes.filter(({ scope }) => (
        documentEntries.length > 0 ? scope === "document" : scope === "external"
      ));
  scopes.forEach(({ scope, icon, label }) => {
    const scopedEntries = entriesForScope(entries, target, scope);
    if (scopedEntries.length === 0) return;
    appendSeparator(row);
    const button = createCountButton(
      `${label} {count}`,
      scopedEntries.length,
      `${label} ${scopedEntries.length}`,
      (clicked) => onOpen(clicked, group, hostBlockId, preferredGroup, scope),
    );
    if (!button) return;
    button.classList.add("ariaLabel");
    button.setAttribute("aria-label", `${label} ${scopedEntries.length}`);
    button.dataset.topicScope = scope;
    button.dataset.topicIcon = icon;
    button.innerHTML = `<svg aria-hidden="true"><use xlink:href="#${icon}"></use></svg><span class="damophus-topic-relations__count-number">${scopedEntries.length}</span>`;
    row.append(button);
  });
}

function appendSeparator(container: HTMLElement): void {
  if (container.lastElementChild) {
    const separator = document.createElement("span");
    separator.className = "damophus-topic-relations__separator";
    separator.textContent = "·";
    separator.setAttribute("aria-hidden", "true");
    container.append(separator);
  }
}

function createExpandedGroup(
  label: string,
  entries: readonly TopicRelationEntry[],
  nativeHover: boolean,
): HTMLElement | undefined {
  if (entries.length === 0) return undefined;
  const group = document.createElement("div");
  group.className = "damophus-topic-relations__expanded-group";
  const heading = document.createElement("span");
  heading.className = "damophus-topic-relations__expanded-label";
  heading.textContent = label;
  group.append(heading);
  const links = document.createElement("span");
  links.className = "damophus-topic-relations__expanded-links";
  entries.forEach((entry) => {
    appendSeparator(links);
    links.append(createNativeBlockRef(entry, nativeHover));
  });
  group.append(links);
  return group;
}

function markerSignature(
  target: TopicRelationTarget,
  index: ReadonlyMap<string, TopicRelationGroup>,
  options: TopicRelationRenderOptions,
): string {
  const relations = [...target.questionTopicIds, ...(target.noteTopicId ? [target.noteTopicId] : [])]
    .map((topicId) => {
      const group = index.get(topicId);
      return [
        topicId,
        group?.label,
        group?.notes.map((entry) => entry.blockId).join(","),
        group?.questions.map((entry) => entry.blockId).join(","),
      ].join(":");
    }).join("|");
  return [
    target.blockId,
    target.documentId,
    target.noteTopicId,
    target.questionTopicIds.join(","),
    options.displayMode,
    options.nativeHover,
    options.error,
    relations,
  ].join(";");
}

function isEditorBlockTarget(target: HTMLElement): boolean {
  return target.hasAttribute("data-node-id") && Boolean(target.closest(".protyle-wysiwyg"));
}

function markerTargetId(marker: HTMLElement): string | undefined {
  return marker.dataset.topicRelationsTargetId || marker.dataset.signature?.split(";", 1)[0];
}

function markerBelongsToTarget(
  marker: HTMLElement,
  target: TopicRelationTarget,
): boolean {
  if (markerTargetId(marker) !== target.blockId) return false;
  return marker.parentElement === target.element || marker.previousElementSibling === target.element;
}

function markerHasSafePlacement(marker: HTMLElement, target: HTMLElement): boolean {
  return isEditorBlockTarget(target)
    ? marker.previousElementSibling === target
    : marker.parentElement === target;
}

function insertMarker(target: HTMLElement, marker: HTMLElement): void {
  if (isEditorBlockTarget(target)) {
    target.insertAdjacentElement("afterend", marker);
    return;
  }
  const nativeAttribute = Array.from(target.children).find(
    (child) => child.classList.contains("protyle-attr"),
  );
  target.insertBefore(marker, nativeAttribute ?? null);
}

function appendQuestionTopic(
  row: HTMLElement,
  group: TopicRelationGroup,
  target: TopicRelationTarget,
  options: TopicRelationRenderOptions,
): void {
  appendSeparator(row);
  const notes = group.notes.filter((entry) => entry.blockId !== target.blockId);
  const questions = group.questions.filter((entry) => entry.blockId !== target.blockId);
  if (notes.length === 1) {
    row.append(createNativeBlockRef(notes[0], options.nativeHover));
  } else {
    row.append(createTopicButton(
      group.label,
      notes.length === 0 ? options.labels.unresolved : options.labels.openRelations,
      (button) => options.onOpen(button, group, target.blockId, "notes"),
    ));
  }

  if (options.displayMode === "summary") {
    appendScopedCountButtons(
      row,
      notes,
      target,
      options.labels,
      options.onOpen,
      group,
      target.blockId,
      "notes",
    );
  } else if (options.displayMode === "compact") {
    appendScopedCountButtons(
      row,
      notes,
      target,
      options.labels,
      options.onOpen,
      group,
      target.blockId,
      "notes",
    );
  }
  appendScopedCountButtons(
    row,
    questions,
    target,
    options.labels,
    options.onOpen,
    group,
    target.blockId,
    "questions",
  );
}

function renderMarker(
  target: TopicRelationTarget,
  index: ReadonlyMap<string, TopicRelationGroup>,
  options: TopicRelationRenderOptions,
): HTMLElement {
  const marker = document.createElement("div");
  marker.className = TOPIC_RELATION_MARKER_CLASS;
  marker.contentEditable = "false";

  if (options.error) {
    const status = document.createElement("span");
    status.className = "damophus-topic-relations__status damophus-topic-relations__status--error";
    status.textContent = options.labels.loadFailed;
    const retry = createTopicButton(options.labels.retry, options.error, () => options.onRetry());
    marker.append(status, retry);
    return marker;
  }

  if (target.noteTopicId) {
    const group = index.get(target.noteTopicId) ?? {
      topicId: target.noteTopicId,
      label: target.noteTopicId,
      notes: [],
      questions: [],
    };
    const row = document.createElement("div");
    row.className = "damophus-topic-relations__row";
    const label = document.createElement("span");
    label.className = "damophus-topic-relations__label";
    label.textContent = options.labels.topicNote;
    row.append(label);
    const otherNotes = group.notes.filter((entry) => entry.blockId !== target.blockId);
    const questions = group.questions.filter((entry) => entry.blockId !== target.blockId);
    appendScopedCountButtons(row, otherNotes, target, options.labels, options.onOpen, group, target.blockId, "notes");
    appendScopedCountButtons(row, questions, target, options.labels, options.onOpen, group, target.blockId, "questions");
    marker.append(row);

    if (options.displayMode === "expanded") {
      const notesGroup = createExpandedGroup(options.labels.otherTopicNotes, otherNotes, options.nativeHover);
      const questionsGroup = createExpandedGroup(options.labels.relatedQuestions, questions, options.nativeHover);
      if (notesGroup) marker.append(notesGroup);
      if (questionsGroup) marker.append(questionsGroup);
    }
  }

  if (target.questionTopicIds.length > 0) {
    const row = document.createElement("div");
    row.className = "damophus-topic-relations__row";
    const label = document.createElement("span");
    label.className = "damophus-topic-relations__label";
    label.textContent = options.labels.topics;
    row.append(label);
    target.questionTopicIds.forEach((topicId) => {
      const group = index.get(topicId) ?? { topicId, label: topicId, notes: [], questions: [] };
      appendQuestionTopic(row, group, target, options);
    });
    marker.append(row);

    if (options.displayMode === "expanded") {
      target.questionTopicIds.forEach((topicId) => {
        const group = index.get(topicId);
        if (!group) return;
        const heading = document.createElement("div");
        heading.className = "damophus-topic-relations__topic-heading";
        heading.textContent = group.label;
        marker.append(heading);
        const notes = group.notes.filter((entry) => entry.blockId !== target.blockId);
        const questions = group.questions.filter((entry) => entry.blockId !== target.blockId);
        const notesGroup = createExpandedGroup(options.labels.topicNotes, notes, options.nativeHover);
        const questionsGroup = createExpandedGroup(options.labels.relatedQuestions, questions, options.nativeHover);
        if (notesGroup) marker.append(notesGroup);
        if (questionsGroup) marker.append(questionsGroup);
      });
    }
  }

  return marker;
}

export function syncTopicRelationMarkers(
  root: ParentNode,
  targets: readonly TopicRelationTarget[],
  index: ReadonlyMap<string, TopicRelationGroup>,
  options: TopicRelationRenderOptions,
): void {
  root.querySelectorAll<HTMLElement>(`.${TOPIC_RELATION_MARKER_CLASS}`).forEach((marker) => {
    if (!targets.some((target) => markerBelongsToTarget(marker, target))) marker.remove();
  });
  for (const target of targets) {
    const signature = markerSignature(target, index, options);
    const existing = Array.from(root.querySelectorAll<HTMLElement>(
      `.${TOPIC_RELATION_MARKER_CLASS}`,
    )).find((marker) => markerBelongsToTarget(marker, target));
    if (
      existing?.dataset.signature === signature
      && markerHasSafePlacement(existing, target.element)
    ) continue;
    const marker = renderMarker(target, index, options);
    marker.dataset.signature = signature;
    marker.dataset.topicRelationsTargetId = target.blockId;
    existing?.remove();
    insertMarker(target.element, marker);
  }
}

export function removeTopicRelationMarkers(root: ParentNode): void {
  root.querySelectorAll(`.${TOPIC_RELATION_MARKER_CLASS}`).forEach((marker) => marker.remove());
}
