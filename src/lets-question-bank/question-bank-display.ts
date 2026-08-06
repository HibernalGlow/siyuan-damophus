import type { BlockBreadcrumbItem } from "@/api";
import {
  normalizeBreadcrumbPriority,
  normalizeBreadcrumbTextDisplay,
  ScrollableBreadcrumb,
  type BreadcrumbTextDisplay,
  type BreadcrumbOverflowPriority,
} from "@/lets-mobile-breadcrumb/breadcrumb-scroll";
import type { QuestionType, ScanMessage, ShuffledOption, TopicNode } from "@/question-bank/core/types";
import { PracticeSessionLifecycleError } from "@/question-bank/application";

export type Label = (key: string, fallback: string) => string;

export function getBuildRevision(): string {
  return typeof __DAMOPHUS_BUILD_REVISION__ === "string"
    ? __DAMOPHUS_BUILD_REVISION__
    : "dev-unversioned";
}

export function practiceErrorMessage(reason: unknown, label: Label): string {
  if (reason instanceof PracticeSessionLifecycleError && reason.code === "session-in-use") {
    return label("sessionInUse", "This practice session is open in another window");
  }
  if (reason instanceof PracticeSessionLifecycleError && reason.code === "session-has-no-questions") {
    return label("sessionHasNoQuestions", "None of this session's questions still exist");
  }
  return reason instanceof Error ? reason.message : String(reason);
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function topicLabel(topic: TopicNode): string {
  const depth = Math.max(0, topic.level - 1);
  return `${"  ".repeat(depth)}${topic.title}`;
}

export function questionTypeLabel(type: QuestionType, label: Label): string {
  const labels: Record<QuestionType, string> = {
    single: label("questionTypeSingle", "Single choice"),
    multiple: label("questionTypeMultiple", "Multiple choice"),
    indefinite: label("questionTypeIndefinite", "Indefinite choice"),
    "true-false": label("questionTypeTrueFalse", "True or false"),
    subjective: label("questionTypeSubjective", "Subjective"),
    group: label("questionTypeGroup", "Question group"),
  };
  return labels[type];
}

export function sourceTypeLabel(type: string, label: Label): string {
  const labels: Record<string, string> = {
    d: label("sourceTypeDocument", "Document"),
    h: label("sourceTypeHeading", "Heading"),
    p: label("sourceTypeParagraph", "Paragraph"),
    l: label("sourceTypeList", "List"),
    i: label("sourceTypeListItem", "List item"),
    t: label("sourceTypeTable", "Table"),
  };
  return labels[type] ?? label("sourceTypeBlock", "Block");
}

export function completionStatusLabel(attempted: number, total: number, label: Label): string {
  if (attempted === 0) return label("notStarted", "Not started");
  if (attempted >= total) return label("completed", "Completed");
  return label("inProgress", "In progress");
}

export function messageContext(message: ScanMessage, label: Label): string {
  return [
    message.questionId ? `${label("question", "Question")}: ${message.questionId}` : "",
    message.line ? `${label("line", "Line")}: ${message.line}` : "",
  ].filter(Boolean).join(" / ");
}

export function messageClipboardText(message: ScanMessage, label: Label): string {
  return [
    `[${message.code}] ${message.message}`,
    message.title ? `${label("heading", "Heading")}: ${message.title}` : "",
    messageContext(message, label),
    message.sourceMarkdown ? `${label("sourceMarkdown", "Original Markdown")}\n${message.sourceMarkdown}` : "",
  ].filter(Boolean).join("\n");
}

export function scanLogText(
  groups: Array<{ key: string; messages: ScanMessage[] }>,
  label: Label,
): string {
  return groups
    .filter((group) => group.messages.length > 0)
    .map((group) => [
      label(group.key, group.key),
      ...group.messages.map((message) => messageClipboardText(message, label)),
    ].join("\n\n"))
    .join("\n\n---\n\n");
}

export function optionMarkdown(option: ShuffledOption, questionType: QuestionType | undefined, label: Label): string {
  if (questionType !== "true-false" || option.markdown) return option.markdown;
  return option.originalId === "true"
    ? label("trueAnswer", "True")
    : label("falseAnswer", "False");
}

export async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

export function createLatestBreadcrumbLoader(
  getLoader: () => ((blockId: string) => Promise<BlockBreadcrumbItem[]>) | undefined,
  setItems: (items: BlockBreadcrumbItem[]) => void,
) {
  let request = 0;
  return async (blockId: string): Promise<void> => {
    const current = ++request;
    const loader = getLoader();
    if (!loader) return setItems([]);
    try {
      const items = await loader(blockId);
      if (current === request) setItems(items);
    } catch {
      if (current === request) setItems([]);
    }
  };
}

export function createPracticeBreadcrumbAction(
  node: HTMLElement,
  state: { items: BlockBreadcrumbItem[]; activeId?: string; fallback: string },
  options: {
    mobile: boolean;
    priority: BreadcrumbOverflowPriority;
    textDisplay: BreadcrumbTextDisplay;
    label: Label;
    onNavigate?: (id: string) => void;
  },
) {
  const scroller = new ScrollableBreadcrumb(node, {
    priority: options.mobile ? normalizeBreadcrumbPriority(options.priority) : "head",
    onNavigate: options.onNavigate,
  });
  const render = (next: typeof state): void => {
    if (next.items.length > 0 && next.items.some((item) => item.name.trim().length > 0)) {
      scroller.renderMobileItems(
        next.items,
        next.activeId,
        options.label("expand", "Expand"),
        options.mobile ? options.textDisplay : normalizeBreadcrumbTextDisplay("full", 16, 160),
      );
      return;
    }
    renderFallbackBreadcrumb(node, next.fallback);
  };
  render(state);
  return { update: render, destroy: () => scroller.destroy() };
}

function renderFallbackBreadcrumb(node: HTMLElement, fallback: string): void {
  const parts = fallback.split(/\s*\/\s*/u).filter(Boolean);
  const fragment = document.createDocumentFragment();
  parts.forEach((part, index) => {
    const text = document.createElement("span");
    text.className = "practice-breadcrumb-fallback-item";
    text.textContent = part;
    fragment.append(text);
    if (index >= parts.length - 1) return;
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "2");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("stroke-linejoin", "round");
    icon.setAttribute("aria-hidden", "true");
    icon.classList.add("practice-breadcrumb-separator");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "m9 18 6-6-6-6");
    icon.append(path);
    fragment.append(icon);
  });
  node.replaceChildren(fragment);
}
