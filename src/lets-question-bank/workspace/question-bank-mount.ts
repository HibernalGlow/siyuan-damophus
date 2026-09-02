import { appendBlock, deleteBlock, getBlockBreadcrumb, getChildBlocks, setBlockAttrs, sql } from "@/api";
import { settings } from "@/settings";
import { Protyle } from "siyuan";
import { mount } from "svelte";
import { isMobile, plugin } from "@/utils";
import pluginManifest from "../../../plugin.json";
import QuestionBank from "../question-bank.svelte";
import { QuestionBankController } from "../controller";
import { getLogger } from "@/libs/logger";
import { siyuanKernelClient } from "@/question-bank/adapters/siyuan/client";
import { BroadcastPracticeSessionLeaseCoordinator } from "../session-host";
import { normalizeDurationComparisonPosition } from "../statistics/duration-comparison-position";
import {
  DEFAULT_DOCUMENT_PATH_HIGHLIGHTS,
  DOCUMENT_PATH_HIGHLIGHTS_SETTING_KEY,
  normalizeDocumentPathHighlights,
} from "@/libs/document-path-highlights";
import { normalizeBreadcrumbPriority, normalizeBreadcrumbTextDisplay } from "@/lets-mobile-breadcrumb/breadcrumb-scroll";
import {
  EMPTY_SOURCE_EMBED_SQL,
  loadSourceEmbedRows,
  sourceEmbedBlockIds,
  sourceEmbedSql,
  sourceEmbedSubtreeIds,
  type SourceEmbedBlockRow,
  type SourceEmbedSection,
} from "../source/source-embed-query";
import {
  defocusProtyleEditor,
  enforceSourceBlockReadOnly,
  observeFocusedBlock,
  sourceBlockEditorMode,
  sourceBlockProtyleActions,
  sourceEmbedBlockAttributes,
} from "../source/source-embed-presentation";
import { SiyuanPluginStoreFileIO } from "@/question-bank/adapters/tinybase/siyuan-file-io";
import { TopicDictionaryStore } from "@/question-bank/adapters/siyuan/topic-dictionary";
import type { TinyBaseRuntime } from "../tinybase-runtime";
import type { StoreSyncCoordinator } from "../sync-coordinator";
import type { TinyBaseSiyuanCatalogRuntime } from "../tinybase-catalog-runtime";
import type { StatisticsCardPreviewRequest } from "../statistics/statistics-preview";
import type { OpenDocumentTab } from "@/libs/open-document-tabs";

const log = getLogger("lets-question-bank");

/** Surface of the plugin the question-bank mount needs. */
export interface QuestionBankMountHost {
  getSetting(key: string): unknown;
  setSetting(key: string, value: unknown): void;
  readonly sessionLeases: BroadcastPracticeSessionLeaseCoordinator;
  getTinyBaseRuntime(): TinyBaseRuntime;
  getTinyBaseCatalogRuntime(): TinyBaseSiyuanCatalogRuntime;
  currentDocumentId(): string | undefined;
  openDocumentTabs(): Promise<OpenDocumentTab[]>;
  openStatisticsCardPreview(request: StatisticsCardPreviewRequest): void;
  questionRenderer(markdown: string, inheritSourceStyles: boolean): string | undefined;
  openQuestionSource(blockId: string): Promise<void>;
  readonly storeSyncCoordinator?: StoreSyncCoordinator;
}

export function mountQuestionBank(
  host: QuestionBankMountHost,
  target: HTMLElement,
  documentId?: string,
  beforeOpenQuestionSource?: () => void,
  onClose?: () => void,
): ReturnType<typeof mount> {
  target.classList.add(
    "damophus-question-bank-host",
    "flex",
    "h-full",
    "min-h-0",
    "flex-col",
    "overflow-hidden",
  );
  const controller = new QuestionBankController({
    getSetting: (key) => host.getSetting(key),
    setSetting: (key, value) => host.setSetting(key, value),
    pluginVersion: pluginManifest.version,
    sessionLeases: host.sessionLeases,
    tinybaseRuntime: host.getTinyBaseRuntime(),
    tinybaseCatalogRuntime: host.getTinyBaseCatalogRuntime(),
  });
  const topicDictionaryStore = new TopicDictionaryStore(
    new SiyuanPluginStoreFileIO(plugin, siyuanKernelClient),
    siyuanKernelClient,
  );
  const sourceRowsCache = new Map<string, Promise<SourceEmbedBlockRow[]>>();
  const sourceQueryCache = new Map<string, Promise<string>>();
  const loadRowsByIds = async (blockIds: readonly string[]): Promise<SourceEmbedBlockRow[]> => {
    const rows: SourceEmbedBlockRow[] = [];
    for (let offset = 0; offset < blockIds.length; offset += 48) {
      const chunk = blockIds.slice(offset, offset + 48);
      const quotedIds = chunk.map((id) => `'${id.replace(/'/gu, "''")}'`).join(", ");
      rows.push(...await sql(
        `SELECT id, root_id, parent_id, sort, path, type, subtype, content, markdown, ial FROM blocks WHERE id IN (${quotedIds}) LIMIT ${chunk.length}`,
      ) as SourceEmbedBlockRow[]);
    }
    return rows;
  };
  const loadSourceRows = (blockId: string): Promise<SourceEmbedBlockRow[]> => {
    const cached = sourceRowsCache.get(blockId);
    if (cached) return cached;
    const loading = loadSourceEmbedRows(blockId, {
      loadChildren: (id) => getChildBlocks(id),
      loadRows: loadRowsByIds,
    }).catch((error) => {
      sourceRowsCache.delete(blockId);
      throw error;
    });
    sourceRowsCache.set(blockId, loading);
    return loading;
  };
  const loadSourceQuery = (blockId: string, section: SourceEmbedSection): Promise<string> => {
    const key = `${blockId}:${section}`;
    const cached = sourceQueryCache.get(key);
    if (cached) return cached;
    const loading = loadSourceRows(blockId)
      .then((rows) => sourceEmbedSql(rows, blockId, section, {
        hideEmptySolutionBlocks: section === "solution" && host.getSetting("hideEmptyAnswerBlocks") !== false,
      }))
      .catch((error) => {
        sourceQueryCache.delete(key);
        throw error;
      });
    sourceQueryCache.set(key, loading);
    return loading;
  };
  const app = mount(QuestionBank, {
    target,
    props: {
      controller,
      initialDocumentId: documentId,
      getCurrentDocumentId: () => host.currentDocumentId(),
      getOpenDocumentTabs: () => host.openDocumentTabs(),
      documentPathHighlights: normalizeDocumentPathHighlights(
        host.getSetting(DOCUMENT_PATH_HIGHLIGHTS_SETTING_KEY) ?? DEFAULT_DOCUMENT_PATH_HIGHLIGHTS,
      ),
      translations: plugin.i18n,
      loadTopicDictionary: () => topicDictionaryStore.load(),
      loadSubjectQuestionTotals: async () => {
        const raw = await new SiyuanPluginStoreFileIO(plugin, siyuanKernelClient)
          .read("/data/storage/petal/siyuan-damophus/subject-question-totals.json");
        if (!raw) return undefined;
        try { return JSON.parse(raw); } catch { return undefined; }
      },
      reviewThreshold: Number(host.getSetting("reviewThreshold")) || 2,
      inheritSourceStyles: host.getSetting("inheritSourceStyles") !== false,
      questionRenderMode: (host.getSetting("questionRenderMode") as "html" | "native" | "embed" | undefined) ?? "native",
      durationComparisonPosition: normalizeDurationComparisonPosition(host.getSetting("durationComparisonPosition")),
      autoSyncIndex: host.getSetting("autoSyncIndex") === true,
      autoScanDocument: host.getSetting("autoScanDocument") === true,
      showPracticeTitle: host.getSetting("showPracticeTitle") === true,
      showPracticeBreadcrumb: host.getSetting("showPracticeBreadcrumb") !== false,
      indefinitePracticeMode: host.getSetting("indefinitePracticeMode") === true,
      timingEnabled: host.getSetting("timingEnabled") !== false,
      pauseOnAnswerReveal: host.getSetting("pauseOnAnswerReveal") !== false,
      pauseOnBlur: host.getSetting("pauseOnBlur") === true,
      revealActionBelowOptions:
        host.getSetting("revealActionBelowOptions") === true
        || host.getSetting("revealActionBelowOptions") === "belowOptions",
      completionShowCorrectness: host.getSetting("completionShowCorrectness") !== false,
      completionShowRating: host.getSetting("completionShowRating") !== false,
      completionShowDuration: host.getSetting("completionShowDuration") !== false,
      completionShowAnswer: host.getSetting("completionShowAnswer") !== false,
      completionShowAnsweredAt: host.getSetting("completionShowAnsweredAt") === true,
      mobileBreadcrumb: isMobile,
      breadcrumbPriority: normalizeBreadcrumbPriority(
        settings.getBySpace("mobileBreadcrumb", "overflowPriority"),
      ),
      breadcrumbTextDisplay: normalizeBreadcrumbTextDisplay(
        settings.getBySpace("mobileBreadcrumb", "textDisplayMode"),
        settings.getBySpace("mobileBreadcrumb", "maxCharacters"),
        settings.getBySpace("mobileBreadcrumb", "maxTextWidth"),
      ),
      loadBreadcrumb: (blockId: string) => getBlockBreadcrumb(blockId),
      onClose,
      openStatisticsCardPreview: (request: StatisticsCardPreviewRequest) => host.openStatisticsCardPreview(request),
      renderQuestionMarkdown: (markdown: string, inheritSourceStyles: boolean) => (
        host.questionRenderer(markdown, inheritSourceStyles)
      ),
      prepareSourceBlock: async (blockId: string) => {
        await Promise.all([
          loadSourceRows(blockId),
          loadSourceQuery(blockId, "stem"),
          loadSourceQuery(blockId, "solution"),
        ]);
      },
      mountSourceBlock: async (
        mountTarget: HTMLElement,
        blockId: string,
        editable: boolean,
        section: SourceEmbedSection = "stem",
        renderMode: "native" | "embed" = "embed",
      ) => {
        const binding = controller.getBinding();
        let temporaryEmbedId: string | undefined;
        if (renderMode === "embed" && binding?.systemDocumentId) {
          let embedQuery = `SELECT * FROM blocks WHERE id = '${blockId.replace(/'/gu, "''")}'`;
          try {
            embedQuery = await loadSourceQuery(blockId, section);
          } catch (error) {
            log.warn("failed to resolve question embed range", error);
            embedQuery = EMPTY_SOURCE_EMBED_SQL;
          }
          if (embedQuery !== EMPTY_SOURCE_EMBED_SQL) {
            const operations = await appendBlock(
              "markdown",
              `{{${embedQuery}}}`,
              binding.systemDocumentId,
            );
            temporaryEmbedId = operations[0]?.doOperations?.[0]?.id;
          }
          if (temporaryEmbedId) {
            await setBlockAttrs(temporaryEmbedId, sourceEmbedBlockAttributes({
              breadcrumb: host.getSetting("embedBreadcrumb") === true,
              headingMode: host.getSetting("embedHeadingMode"),
            }));
          }
        }
        const sourceRows = renderMode === "native" ? await loadSourceRows(blockId) : undefined;
        const mountedBlockIds = sourceRows
          ? sourceEmbedBlockIds(sourceRows, blockId, section, {
              hideEmptySolutionBlocks: section === "solution" && host.getSetting("hideEmptyAnswerBlocks") !== false,
            })
          : temporaryEmbedId ? [temporaryEmbedId] : [];
        const editors = await Promise.all(mountedBlockIds.map(async (mountedBlockId) => {
          const editorHost = document.createElement("div");
          editorHost.className = "damophus-native-source-block";
          mountTarget.append(editorHost);
          let stopBlockIsolation = () => {};
          let stopReadOnlyEnforcement = () => {};
          let defocusTimer: ReturnType<typeof setTimeout> | undefined;
          const editor = new Protyle(plugin.app, editorHost, {
            mode: sourceBlockEditorMode,
            action: [...sourceBlockProtyleActions],
            blockId: mountedBlockId,
            after: (mountedEditor) => {
              stopReadOnlyEnforcement();
              if (!editable) {
                mountedEditor.disable();
                stopReadOnlyEnforcement = enforceSourceBlockReadOnly(
                  mountedEditor.protyle.wysiwyg.element,
                );
              }
              stopBlockIsolation();
              stopBlockIsolation = observeFocusedBlock(
                mountedEditor.protyle.wysiwyg.element,
                mountedBlockId,
                sourceRows ? sourceEmbedSubtreeIds(sourceRows, mountedBlockId) : [mountedBlockId],
              );
              if (isMobile) {
                defocusProtyleEditor(mountedEditor.protyle.wysiwyg.element);
                defocusTimer = setTimeout(
                  () => defocusProtyleEditor(mountedEditor.protyle.wysiwyg.element),
                  0,
                );
              }
            },
            render: {
              background: false,
              title: false,
              gutter: true,
              scroll: false,
              breadcrumb: false,
            },
          });
          if (binding?.notebookId) editor.protyle.notebookId = binding.notebookId;
          return {
            editor,
            stopBlockIsolation: () => stopBlockIsolation(),
            stopReadOnlyEnforcement: () => stopReadOnlyEnforcement(),
            cancelDefocus: () => {
              if (defocusTimer !== undefined) clearTimeout(defocusTimer);
            },
          };
        }));
        return async () => {
          for (const mounted of editors) {
            mounted.cancelDefocus();
            mounted.stopBlockIsolation();
            mounted.stopReadOnlyEnforcement();
            mounted.editor.destroy();
          }
          mountTarget.replaceChildren();
          if (temporaryEmbedId) await deleteBlock(temporaryEmbedId);
        };
      },
      onAutoSyncIndexChange: (value: boolean) => host.setSetting("autoSyncIndex", value),
      onAutoScanDocumentChange: (value: boolean) => host.setSetting("autoScanDocument", value),
      onIndefinitePracticeModeChange: (value: boolean) => host.setSetting("indefinitePracticeMode", value),
      onPauseOnBlurChange: (value: boolean) => host.setSetting("pauseOnBlur", value),
      onDocumentPathHighlightsChange: (value: string[]) => {
        void host.setSetting(DOCUMENT_PATH_HIGHLIGHTS_SETTING_KEY, value.join("\n"));
      },
      openQuestionSource: (blockId: string) => {
        beforeOpenQuestionSource?.();
        void host.openQuestionSource(blockId);
      },
    },
  });
  void host.storeSyncCoordinator?.request();
  return app;
}
