import type { QuestionTopicAssignment, TopicRelationPreview, TopicRelationSyncMode } from "@/question-bank/adapters/siyuan/topic-index";
import type { QuestionBankUiController } from "../controller";

/** Live view of the component state the topic-relation actions read and write. */
export interface TopicRelationActionsState {
  topicRelationMode: "off" | TopicRelationSyncMode;
  topicRelationPreview: TopicRelationPreview | undefined;
  topicAssignments: QuestionTopicAssignment[];
  topicRelationReady: boolean;
  syncTopicProgress: boolean;
}

export function createTopicRelationActions(deps: {
  state: TopicRelationActionsState;
  controller: QuestionBankUiController;
  run: (operation: () => Promise<void>) => Promise<void>;
  onSyncTopicProgressChange: (value: boolean) => void;
}) {
  const { state, controller, run } = deps;

  function setTopicRelationMode(mode: "off" | TopicRelationSyncMode): void {
    state.topicRelationMode = mode;
    state.topicRelationPreview = undefined;
  }

  function previewTopicRelations(): void {
    if (state.topicRelationMode === "off" || !state.topicRelationReady || !controller.previewTopicRelationSync) return;
    const mode = state.topicRelationMode;
    void run(async () => {
      state.topicRelationPreview = await controller.previewTopicRelationSync!(state.topicAssignments, mode);
    });
  }

  function toggleSyncTopicProgress(checked: boolean): void {
    state.syncTopicProgress = checked;
    controller.setSetting?.("syncTopicProgress", checked);
    void controller.saveSetting?.("syncTopicProgress", checked);
    deps.onSyncTopicProgressChange(checked);
  }

  function rebuildTopicProgress(): void {
    if (!controller.rebuildTopicStatistics) return;
    void run(async () => {
      await controller.rebuildTopicStatistics!();
    });
  }

  function confirmTopicRelations(): void {
    if (state.topicRelationMode === "off" || !state.topicRelationPreview || !controller.confirmTopicRelationSync) return;
    const mode = state.topicRelationMode;
    void run(async () => {
      state.topicRelationPreview = await controller.confirmTopicRelationSync!(
        state.topicAssignments,
        mode,
        state.topicRelationPreview!.token,
        { syncProgress: state.syncTopicProgress },
      );
    });
  }

  return { setTopicRelationMode, previewTopicRelations, toggleSyncTopicProgress, rebuildTopicProgress, confirmTopicRelations };
}
