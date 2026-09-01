import type { Question, QuestionBookmark } from "@/question-bank/core/types";
import type { StatisticsBookmarkEntry } from "../statistics/statistics-bookmarks";
import type { QuestionBankUiController } from "../controller";

/** Live view of the component state the bookmark actions read and write. */
export interface BookmarkActionsState {
  currentQuestion: Question | undefined;
  currentBookmark: QuestionBookmark | undefined;
  bookmarks: ReadonlyMap<string, QuestionBookmark>;
}

export function createBookmarkActions(deps: {
  state: BookmarkActionsState;
  controller: QuestionBankUiController;
  openQuestionSource: ((blockId: string) => void) | undefined;
}) {
  const { state, controller } = deps;

  async function toggleBookmark(): Promise<void> {
    if (!state.currentQuestion) return;
    const qid = state.currentQuestion.id;
    if (state.currentBookmark) {
      await controller.removeBookmark(qid);
      const next = new Map(state.bookmarks);
      next.delete(qid);
      state.bookmarks = next;
    } else {
      const b: QuestionBookmark = {
        questionId: qid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: [],
        note: "",
      };
      await controller.saveBookmark(b);
      const next = new Map(state.bookmarks);
      next.set(qid, b);
      state.bookmarks = next;
    }
  }

  async function saveBookmarkDetails(tags: string[], note: string): Promise<void> {
    if (!state.currentQuestion) return;
    const qid = state.currentQuestion.id;
    const b: QuestionBookmark = {
      questionId: qid,
      createdAt: state.currentBookmark?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags,
      note,
    };
    await controller.saveBookmark(b);
    const next = new Map(state.bookmarks);
    next.set(qid, b);
    state.bookmarks = next;
  }

  async function removeCurrentBookmark(): Promise<void> {
    if (!state.currentQuestion) return;
    const qid = state.currentQuestion.id;
    await controller.removeBookmark(qid);
    const next = new Map(state.bookmarks);
    next.delete(qid);
    state.bookmarks = next;
  }

  function openBookmarkSource(entry: StatisticsBookmarkEntry): void {
    if (entry.blockId) deps.openQuestionSource?.(entry.blockId);
  }

  return { toggleBookmark, saveBookmarkDetails, removeCurrentBookmark, openBookmarkSource };
}

export function buildStatisticsBookmarkTitles(
  catalog: readonly { questionId: string; title?: string }[] | undefined,
  scannedQuestions: readonly Question[],
): Map<string, string> {
  const titles = new Map<string, string>();
  for (const entry of catalog ?? []) {
    if (entry.title) titles.set(entry.questionId, entry.title);
  }
  for (const question of scannedQuestions) {
    if (question.title) titles.set(question.id, question.title);
  }
  return titles;
}
