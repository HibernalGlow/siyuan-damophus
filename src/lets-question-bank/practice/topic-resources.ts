import type { QuestionIndexPreview } from "@/question-bank/application/indexing";
import type { TopicResourceProjection } from "@/question-bank/adapters/siyuan/topic-index";
import type { Question } from "@/question-bank/core/types";
import { getLogger } from "@/libs/logger";
const log = getLogger("question-bank.practice");
import type { QuestionBankUiController } from "../controller";

/** Live view of the component state the topic-resource actions read and write. */
export interface TopicResourceActionsState {
  topicResources: TopicResourceProjection[];
  topicResourceQuestionId: string;
  persistedTopicResourceIdentities: ReadonlySet<string>;
  persistingTopicResourceIdentity: string;
  currentQuestion: Question | undefined;
  currentQuestionBlockId: string | undefined;
  preview: QuestionIndexPreview | undefined;
}

export function createTopicResourceActions(deps: {
  state: TopicResourceActionsState;
  controller: QuestionBankUiController;
  run: (operation: () => Promise<void>) => Promise<void>;
  label: (key: string, fallback: string) => string;
  reload: (questionId: string | undefined) => void;
}) {
  const { state, controller, run } = deps;
  let topicResourceRequest = 0;
  let topicResourceValidationTimer: ReturnType<typeof setTimeout> | undefined;

  async function loadTopicResources(questionId: string | undefined): Promise<void> {
    if (topicResourceValidationTimer) clearTimeout(topicResourceValidationTimer);
    topicResourceValidationTimer = undefined;
    const request = ++topicResourceRequest;
    if (state.topicResourceQuestionId !== (questionId ?? "")) {
      state.persistedTopicResourceIdentities = new Set();
    }
    state.topicResourceQuestionId = questionId ?? "";
    state.topicResources = [];
    if (!questionId || !controller.loadQuestionTopicResources) return;
    try {
      const questionBlockId = state.preview?.scan.blockIdsByQuestionId.get(questionId);
      const resources = await controller.loadQuestionTopicResources(questionId, questionBlockId);
      if (request === topicResourceRequest && state.currentQuestion?.id === questionId) {
        state.topicResources = resources;
        if (resources.length > 0) {
          topicResourceValidationTimer = setTimeout(() => void loadTopicResources(questionId), 10_000);
        }
      }
    } catch (reason) {
      log.warn("topic-resources.failed", { questionId, reason });
    }
  }

  function topicResourceIdentity(projection: TopicResourceProjection): string {
    return `${projection.topicId}:${projection.resource.type}:${projection.resource.content}`;
  }

  function persistTopicResource(projection: TopicResourceProjection): void {
    if (!state.currentQuestion || !state.currentQuestionBlockId || !controller.persistQuestionTopicResource) return;
    const identity = topicResourceIdentity(projection);
    if (!window.confirm(deps.label("confirmPersistTopicResource", "确认将此考点资源固化到题目文档中？"))) return;
    void run(async () => {
      state.persistingTopicResourceIdentity = identity;
      try {
        await controller.persistQuestionTopicResource!({
          questionId: state.currentQuestion!.id,
          questionBlockId: state.currentQuestionBlockId!,
          projection,
        });
        state.persistedTopicResourceIdentities = new Set([...state.persistedTopicResourceIdentities, identity]);
      } finally {
        state.persistingTopicResourceIdentity = "";
      }
    });
  }

  return { loadTopicResources, topicResourceIdentity, persistTopicResource, dispose };

  /** The auto-refresh timer must not fire after the component is destroyed. */
  function dispose(): void {
    if (topicResourceValidationTimer) clearTimeout(topicResourceValidationTimer);
  }
}
