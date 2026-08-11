export const QUESTION_SOURCE_ACTIONS = ["cb-get-hl", "cb-get-context", "cb-get-rootscroll"] as const;

export function questionSourceOpenTarget(
  blockId: string,
  sourceRootId: string | undefined,
  activeRootId: string | undefined,
) {
  return {
    doc: {
      id: blockId,
      action: [...QUESTION_SOURCE_ACTIONS],
    },
    openNewTab: !sourceRootId || sourceRootId !== activeRootId,
  };
}
