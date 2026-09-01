export type QuestionSourceNavigationMode = "focus" | "document";

const QUESTION_SOURCE_FOCUS_ACTIONS = ["cb-get-focus", "cb-get-hl", "cb-get-all"] as const;
const QUESTION_SOURCE_DOCUMENT_ACTIONS = ["cb-get-hl", "cb-get-context", "cb-get-rootscroll"] as const;

export function normalizeQuestionSourceNavigationMode(value: unknown): QuestionSourceNavigationMode {
  return value === "document" ? "document" : "focus";
}

export function questionSourceOpenTarget(
  blockId: string,
  sourceRootId: string | undefined,
  activeRootId: string | undefined,
  mode: unknown = "focus",
) {
  const normalizedMode = normalizeQuestionSourceNavigationMode(mode);
  const doc = normalizedMode === "focus"
    ? {
        id: blockId,
        zoomIn: true,
        action: [...QUESTION_SOURCE_FOCUS_ACTIONS],
      }
    : {
        id: blockId,
        action: [...QUESTION_SOURCE_DOCUMENT_ACTIONS],
      };
  return {
    doc,
    openNewTab: !sourceRootId || sourceRootId !== activeRootId,
  };
}
