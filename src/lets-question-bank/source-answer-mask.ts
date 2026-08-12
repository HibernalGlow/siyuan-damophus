export const ANSWER_MASK_STYLES = ["blur", "solid", "underline"] as const;
export type AnswerMaskStyle = (typeof ANSWER_MASK_STYLES)[number];

export const DEFAULT_ANSWER_MASK_STYLE: AnswerMaskStyle = "blur";
export const ANSWER_MASK_SELECTOR = "[data-damophus-answer-mask]";
const ROOT_SELECTOR = ".protyle-wysiwyg";
const BLOCK_SELECTOR = "[data-node-id]";
const QUESTION_SELECTOR = '[data-node-id][custom-qb-id][custom-qb-answer]';
const SOLUTION_SELECTOR = '[data-node-id][custom-qb-section="solution"]';
const STYLE_ID = "damophus-source-answer-mask-style";

const ANSWER_CSS = `
${ANSWER_MASK_SELECTOR} {
  display: inline-block;
  border-radius: 3px;
  cursor: pointer;
  transition: filter 120ms ease, color 120ms ease, background-color 120ms ease;
}
${ANSWER_MASK_SELECTOR}[data-damophus-answer-mask="blur"] {
  filter: blur(.42em);
}
${ANSWER_MASK_SELECTOR}[data-damophus-answer-mask="solid"] {
  color: transparent !important;
  background: var(--b3-theme-surface-lighter);
  text-shadow: none;
}
${ANSWER_MASK_SELECTOR}[data-damophus-answer-mask="underline"] {
  color: transparent !important;
  background: var(--b3-theme-surface-lighter);
  border-bottom: 2px dotted var(--b3-theme-on-surface-light);
  text-shadow: none;
}
${ANSWER_MASK_SELECTOR}[data-damophus-answer-mask][data-damophus-answer-revealed="true"],
${ANSWER_MASK_SELECTOR}[data-damophus-answer-mask]:hover,
${ANSWER_MASK_SELECTOR}[data-damophus-answer-mask]:focus-visible {
  filter: none;
  color: inherit !important;
  background: transparent;
  border-color: transparent;
  text-shadow: none;
}
`;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function answerAlternatives(raw: string): string[] {
  const values = raw
    .split(/[,\uFF0C\u3001\/\s]+/u)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  if (values.length === 1 && values[0] === "TRUE") return ["true", "\u6b63\u786e"];
  if (values.length === 1 && values[0] === "FALSE") return ["false", "\u9519\u8bef"];
  return values
    .flatMap((value) => /^[A-D]+$/u.test(value) ? [...value] : [value])
    .filter((value) => /^[A-D]$/u.test(value));
}

function answerPattern(raw: string): RegExp | undefined {
  const alternatives = answerAlternatives(raw);
  if (!alternatives.length) return undefined;
  const token = `(?:${alternatives.map(escapeRegExp).join("|")})`;
  const separator = "(?:\\s*(?:[,\\uFF0C\\u3001/]|\\u548c|\\u53ca|and)\\s*)";
  const joinedToken = `(?:${separator}?${token})`;
  return new RegExp(
    `((?:\\u6b63\\u786e\\u7b54\\u6848|\\u53c2\\u8003\\u7b54\\u6848|\\u6807\\u51c6\\u7b54\\u6848|\\u7b54\\u6848|answer)\\s*(?:\\u4e3a|\\u662f|[:\\uFF1A])?\\s*)(${token}${joinedToken}*)`,
    "giu",
  );
}

function appendMaskedSequence(
  fragment: DocumentFragment,
  sequence: string,
  token: RegExp,
  style: AnswerMaskStyle,
): void {
  let lastIndex = 0;
  for (const match of sequence.matchAll(token)) {
    const index = match.index ?? 0;
    if (index > lastIndex) fragment.append(document.createTextNode(sequence.slice(lastIndex, index)));
    const mask = document.createElement("span");
    mask.dataset.damophusAnswerMask = style;
    mask.dataset.damophusAnswerRevealed = "false";
    mask.dataset.answer = match[0];
    mask.tabIndex = 0;
    mask.setAttribute("role", "button");
    mask.setAttribute("aria-label", "Reveal answer");
    mask.textContent = match[0];
    fragment.append(mask);
    lastIndex = index + match[0].length;
  }
  if (lastIndex < sequence.length) fragment.append(document.createTextNode(sequence.slice(lastIndex)));
}

function maskTextNode(node: Text, pattern: RegExp, style: AnswerMaskStyle): void {
  if (!node.parentElement || node.parentElement.closest(ANSWER_MASK_SELECTOR)) return;
  const text = node.nodeValue ?? "";
  pattern.lastIndex = 0;
  if (!pattern.test(text)) return;
  pattern.lastIndex = 0;
  const token = /true|false|\u6b63\u786e|\u9519\u8bef|[A-D]/giu;
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) fragment.append(document.createTextNode(text.slice(lastIndex, index)));
    fragment.append(document.createTextNode(match[1]));
    appendMaskedSequence(fragment, match[2], token, style);
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) fragment.append(document.createTextNode(text.slice(lastIndex)));
  node.replaceWith(fragment);
}

function maskQuestionSolutions(root: HTMLElement, style: AnswerMaskStyle): void {
  let activePattern: RegExp | undefined;
  let insideSolution = false;
  const pending: Array<{ node: Text; pattern: RegExp }> = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current instanceof HTMLElement && current.matches(BLOCK_SELECTOR)) {
      if (current.matches(QUESTION_SELECTOR)) {
        activePattern = answerPattern(current.getAttribute("custom-qb-answer") ?? "");
        insideSolution = false;
      } else if (activePattern && current.matches(SOLUTION_SELECTOR)) {
        insideSolution = true;
      }
    } else if (insideSolution && activePattern && current.nodeType === Node.TEXT_NODE) {
      pending.push({ node: current as Text, pattern: activePattern });
    }
    current = walker.nextNode();
  }
  pending.forEach(({ node, pattern }) => maskTextNode(node, pattern, style));
}

export function sourceAnswerMaskRootsFromMutations(records: readonly MutationRecord[]): HTMLElement[] {
  const roots = new Set<HTMLElement>();
  const addRoot = (node: Node | null) => {
    const element = node instanceof Element ? node : node?.parentElement;
    const root = element?.closest<HTMLElement>(ROOT_SELECTOR);
    if (root) roots.add(root);
  };
  for (const record of records) {
    addRoot(record.target);
    record.addedNodes.forEach(addRoot);
    record.removedNodes.forEach(addRoot);
  }
  return [...roots];
}

function removeMasks(root: ParentNode): void {
  root.querySelectorAll(ANSWER_MASK_SELECTOR).forEach((mask) => {
    mask.replaceWith(document.createTextNode(mask.textContent ?? ""));
  });
}

let activeCleanup: (() => void) | undefined;

export function installSourceAnswerMask(style: AnswerMaskStyle = DEFAULT_ANSWER_MASK_STYLE): () => void {
  activeCleanup?.();
  const normalizedStyle = ANSWER_MASK_STYLES.includes(style) ? style : DEFAULT_ANSWER_MASK_STYLE;
  if (typeof document === "undefined" || !document.body) return () => undefined;

  const styleElement = document.createElement("style");
  styleElement.id = STYLE_ID;
  styleElement.textContent = ANSWER_CSS;
  document.head.append(styleElement);

  let disposed = false;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const pendingRoots = new Set<HTMLElement>();
  const apply = () => {
    refreshTimer = undefined;
    if (disposed) return;
    const roots = [...pendingRoots];
    pendingRoots.clear();
    roots.forEach((root) => {
      if (root.isConnected) maskQuestionSolutions(root, normalizedStyle);
    });
  };
  const schedule = (roots: readonly HTMLElement[]) => {
    roots.forEach((root) => pendingRoots.add(root));
    if (refreshTimer !== undefined || disposed || pendingRoots.size === 0) return;
    refreshTimer = setTimeout(apply, 0);
  };
  const observer = new MutationObserver((records) => schedule(sourceAnswerMaskRootsFromMutations(records)));
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["custom-qb-answer", "custom-qb-section", "custom-qb-id", "data-node-id"],
  });
  const reveal = (event: Event) => {
    const target = event.target as Element | null;
    const mask = target?.closest<HTMLElement>(ANSWER_MASK_SELECTOR);
    if (mask) mask.dataset.damophusAnswerRevealed = mask.dataset.damophusAnswerRevealed === "true" ? "false" : "true";
  };
  const revealKeyboard = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target as Element | null;
    const mask = target?.closest<HTMLElement>(ANSWER_MASK_SELECTOR);
    if (!mask) return;
    event.preventDefault();
    reveal(event);
  };
  document.addEventListener("click", reveal, true);
  document.addEventListener("keydown", revealKeyboard, true);
  document.querySelectorAll<HTMLElement>(ROOT_SELECTOR)
    .forEach((root) => maskQuestionSolutions(root, normalizedStyle));

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    refreshTimer = undefined;
    pendingRoots.clear();
    document.removeEventListener("click", reveal, true);
    document.removeEventListener("keydown", revealKeyboard, true);
    document.querySelectorAll<HTMLElement>(ROOT_SELECTOR).forEach((root) => removeMasks(root));
    styleElement.remove();
    if (activeCleanup === cleanup) activeCleanup = undefined;
  };
  activeCleanup = cleanup;
  return cleanup;
}

export function uninstallSourceAnswerMask(): void {
  activeCleanup?.();
}
