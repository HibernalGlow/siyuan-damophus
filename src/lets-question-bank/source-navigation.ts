export const QUESTION_SOURCE_ACTIONS = ["cb-get-focus", "cb-get-scroll"] as const;

export function questionSourceOpenTarget(
  blockId: string,
  sourceRootId: string | undefined,
  activeRootId: string | undefined,
) {
  return {
    doc: {
      id: blockId,
      zoomIn: true,
      action: [...QUESTION_SOURCE_ACTIONS],
    },
    openNewTab: !sourceRootId || sourceRootId !== activeRootId,
  };
}
