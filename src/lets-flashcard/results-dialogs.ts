import { confirm, Dialog, showMessage } from "siyuan";
import { mount, unmount } from "svelte";
import FlashcardResults from "./FlashcardResults.svelte";
import type { FlashcardRuntime } from "@/flashcard/runtime";
import type { DueCardsData } from "@/flashcard/siyuan-adapter";
import type { FlashcardBlockRow, FlashcardGroup, FlashcardRoot } from "@/flashcard/types";

export interface RegistrationResultsOptions {
  title: string;
  rows: FlashcardBlockRow[];
  roots: FlashcardRoot[];
  due?: DueCardsData;
  continueToReview?: boolean;
  onRegistered: () => void | Promise<void>;
}

/** Everything the results dialogs need from the owning plugin. */
export interface FlashcardResultsHost {
  readonly runtime: FlashcardRuntime;
  reportError(message: string, error: unknown): void;
  reviewGroup(group: FlashcardGroup): Promise<void>;
}

export async function openRegistrationResultsDialog(
  host: FlashcardResultsHost,
  options: RegistrationResultsOptions,
): Promise<void> {
  let app: ReturnType<typeof mount> | undefined;
  const dialog = new Dialog({
    title: options.title,
    content: '<div class="damophus-flashcard-results-host"></div>',
    width: "min(1000px, 94vw)",
    height: "min(760px, 84vh)",
    destroyCallback: () => { if (app) void unmount(app); },
  });
  const target = dialog.element.querySelector<HTMLElement>(".damophus-flashcard-results-host");
  if (!target) return;
  app = mount(FlashcardResults, {
    target,
    props: {
      title: options.title,
      rows: options.rows,
      roots: options.roots,
      due: options.due,
      filtered: true,
      canReview: false,
      onReview: () => undefined,
      onRegister: async () => {
        try {
          const ids = options.roots.map((root) => root.blockId);
          const continueToReview = options.continueToReview !== false;
          if (host.runtime.getSettings().confirmBeforeAutoRegister) {
            const approved = await new Promise<boolean>((resolve) => {
              confirm(
                continueToReview ? "登记并开始复习" : "登记闪卡",
                continueToReview
                  ? `预览包含 ${ids.length} 个卡片根块。登记并验证成功后将直接打开原生闪卡复习，确认继续？`
                  : `预览包含 ${ids.length} 个卡片根块。确认调用 Riff 登记并保留已有调度状态？`,
                () => resolve(true),
                () => resolve(false),
              );
            });
            if (!approved) return;
          }
          const result = await host.runtime.registerCards(ids);
          const pending = result.filter((entry) => entry.status === "pending").length;
          if (pending > 0) {
            showMessage(`${pending} 张闪卡登记或验证失败，请保留此窗口后重试`, 6000, "error");
            return;
          }
          showMessage(
            continueToReview ? `已登记并验证 ${ids.length} 张闪卡，正在打开复习` : `已登记并验证 ${ids.length} 张闪卡`,
            4000,
            "info",
          );
          dialog.destroy();
          await options.onRegistered();
        } catch (error) {
          host.reportError("登记闪卡并打开复习失败", error);
        }
      },
    },
  });
}

export async function viewResultsDialog(
  host: FlashcardResultsHost,
  group: FlashcardGroup,
  filtered: boolean,
): Promise<void> {
  try {
    const rows = await host.runtime.adapter.paginatedSql(group.sqlQuery);
    const roots = filtered
      ? await host.runtime.adapter.inspectRows(rows, host.runtime.getSettings())
      : [];
    const due = filtered
      ? await host.runtime.adapter.buildDueCardsData(
        host.runtime.getSettings().deckId,
        roots.map((root) => root.blockId),
        host.runtime.getSettings().maxReviewCards,
        host.runtime.getSettings().scopedReviewMode,
      )
      : undefined;
    let app: ReturnType<typeof mount> | undefined;
    const dialog = new Dialog({
      title: `${group.name} · ${filtered ? "过滤结果" : "原始 SQL"}`,
      content: '<div class="damophus-flashcard-results-host"></div>',
      width: "min(1000px, 94vw)",
      height: "min(760px, 84vh)",
      destroyCallback: () => { if (app) void unmount(app); },
    });
    const target = dialog.element.querySelector<HTMLElement>(".damophus-flashcard-results-host");
    if (!target) return;
    app = mount(FlashcardResults, {
      target,
      props: {
        title: `${group.name} · ${filtered ? "过滤结果" : "原始 SQL"}`,
        rows,
        roots,
        due,
        filtered,
        onReview: () => {
          dialog.destroy();
          // Re-query after registration; the due snapshot was captured
          // before the user clicked "一键制卡并登记".
          void host.reviewGroup(group);
        },
        onRegister: async () => {
          const ids = roots.map((root) => root.blockId);
          const approved = await new Promise<boolean>((resolve) => {
            confirm(
              "登记闪卡",
              `预览包含 ${ids.length} 个卡片根块。确认调用 Riff 登记并保留已有调度状态？`,
              () => resolve(true),
              () => resolve(false),
            );
          });
          if (!approved) return;
          const result = await host.runtime.registerCards(ids);
          const pending = result.filter((entry) => entry.status === "pending").length;
          showMessage(pending === 0 ? `已登记 ${ids.length} 张闪卡` : `${pending} 张闪卡待制卡`, 5000, pending === 0 ? "info" : "error");
        },
      },
    });
  } catch (error) {
    host.reportError("查询闪卡结果失败", error);
  }
}
