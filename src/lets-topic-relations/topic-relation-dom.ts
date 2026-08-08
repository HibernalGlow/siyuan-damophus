import {
  TOPIC_RELATION_MARKER_CLASS,
  type TopicRelationDisplayMode,
  type TopicRelationEntry,
  type TopicRelationGroup,
  type TopicRelationTarget,
  relationEntryLabel,
} from "./topic-relations";

export type TopicRelationPanelGroup = "notes" | "questions";

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
    target.noteTopicId,
    target.questionTopicIds.join(","),
    options.displayMode,
    options.nativeHover,
    options.error,
    relations,
  ].join(";");
}

function insertMarker(target: HTMLElement, marker: HTMLElement): void {
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
    const more = createCountButton(
      options.labels.more,
      Math.max(0, notes.length - 1),
      options.labels.topicNotes,
      (button) => options.onOpen(button, group, target.blockId, "notes"),
    );
    if (more) row.append(more);
  } else if (options.displayMode === "compact") {
    const noteCount = createCountButton(
      `${options.labels.topicNotes} {count}`,
      Math.max(0, notes.length - 1),
      options.labels.topicNotes,
      (button) => options.onOpen(button, group, target.blockId, "notes"),
    );
    if (noteCount) row.append(noteCount);
  }
  const questionCount = createCountButton(
    `${options.labels.relatedQuestions} {count}`,
    questions.length,
    options.labels.relatedQuestions,
    (button) => options.onOpen(button, group, target.blockId, "questions"),
  );
  if (questionCount) row.append(questionCount);
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
    const noteCount = createCountButton(
      `${options.labels.otherTopicNotes} {count}`,
      otherNotes.length,
      options.labels.otherTopicNotes,
      (button) => options.onOpen(button, group, target.blockId, "notes"),
    );
    const questionCount = createCountButton(
      `${options.labels.relatedQuestions} {count}`,
      questions.length,
      options.labels.relatedQuestions,
      (button) => options.onOpen(button, group, target.blockId, "questions"),
    );
    if (noteCount) {
      appendSeparator(row);
      row.append(noteCount);
    }
    if (questionCount) {
      appendSeparator(row);
      row.append(questionCount);
    }
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
  const targetElements = new Set(targets.map((target) => target.element));
  root.querySelectorAll<HTMLElement>(`.${TOPIC_RELATION_MARKER_CLASS}`).forEach((marker) => {
    if (!marker.parentElement || !targetElements.has(marker.parentElement)) marker.remove();
  });
  for (const target of targets) {
    const signature = markerSignature(target, index, options);
    const existing = Array.from(target.element.children).find(
      (child) => child.classList.contains(TOPIC_RELATION_MARKER_CLASS),
    ) as HTMLElement | undefined;
    if (existing?.dataset.signature === signature) continue;
    const marker = renderMarker(target, index, options);
    marker.dataset.signature = signature;
    existing?.remove();
    insertMarker(target.element, marker);
  }
}

export function removeTopicRelationMarkers(root: ParentNode): void {
  root.querySelectorAll(`.${TOPIC_RELATION_MARKER_CLASS}`).forEach((marker) => marker.remove());
}
