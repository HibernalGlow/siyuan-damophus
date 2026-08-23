import { requestStrict } from "@/api";
import { getLogger } from "@/libs/logger";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { isMobile, plugin } from "@/utils";
import type { IEventBusMap, IWebSocketData } from "siyuan";
import {
  DEFAULT_MOBILE_PANEL_HEIGHT,
  DEFAULT_SOURCE_PRIORITY,
  DEFAULT_TOPIC_RELATION_STYLE,
  NOTE_TOPIC_ATTRIBUTE,
  QUESTION_TOPICS_ATTRIBUTE,
  TOPIC_RELATION_MARKER_CLASS,
  TOPIC_RELATION_SURFACE_ATTRIBUTE,
  buildSurfaceTopicRelationTargets,
  buildTopicRelationAttributeSql,
  buildTopicRelationIndex,
  buildTopicRelationSql,
  clampMobilePanelHeight,
  collectTargetTopicIds,
  findTopicRelationSurfaceCandidates,
  findTopicRelationTargets,
  parsePriorityRules,
  type TopicRelationAttributeRow,
  type TopicRelationDisplayMode,
  type TopicRelationGroup,
  type TopicRelationSqlRow,
  type TopicRelationSurfaceCandidate,
  getQuestionProgressLoader,
  questionProgressFromAggregate,
  setQuestionProgressLoader,
  type QuestionProgress,
  type QuestionProgressLoader,
} from "./topic-relations";
import {
  removeTopicRelationMarkers,
  syncTopicRelationMarkers,
  type TopicRelationLabels,
} from "./topic-relation-dom";
import { TopicRelationPanel, type TopicRelationPanelOptions } from "./topic-relation-panel";
import { buildTopicRelationStyles } from "./topic-relation-styles";
import { SiyuanPluginStoreFileIO } from "@/question-bank/adapters/tinybase/siyuan-file-io";
import { siyuanKernelClient } from "@/question-bank/adapters/siyuan/client";
import {
  TOPIC_DICTIONARY_UPDATED_EVENT,
  TopicDictionaryStore,
} from "@/question-bank/adapters/siyuan/topic-dictionary";
import { TINYBASE_READ_VIEW_UPDATED_EVENT } from "@/lets-question-bank/sync-coordinator";
import { TinyBaseRuntime } from "@/lets-question-bank/tinybase-runtime";
import { TinyBaseWarehouse } from "@/question-bank/adapters/tinybase/warehouse";

const log = getLogger("lets-topic-relations");
const STYLE_ID = "damophus-topic-relations-style";
// Keep statements comfortably below SQLite's SQL-text limits while avoiding
// dozens of network round trips for cards carrying many topic IDs.
const QUERY_CHUNK_SIZE = 512;
const PROGRESS_BLOCK_CHUNK_SIZE = 256;

function currentDeviceId(): string {
  const id = (window as Window & { siyuan?: {config?: {system?: {id?: unknown}}} }).siyuan?.config?.system?.id;
  if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) {
    throw new Error("SiYuan device identity is unavailable");
  }
  return id;
}

function validDisplayMode(value: unknown): TopicRelationDisplayMode {
  return value === "summary" || value === "expanded" ? value : "compact";
}

function mutationContainsTopicTarget(node: Node): boolean {
  if (!(node instanceof HTMLElement)) return false;
  if (node.classList.contains(TOPIC_RELATION_MARKER_CLASS)) return false;
  if (node.closest(`[${TOPIC_RELATION_SURFACE_ATTRIBUTE}]`)) return false;
  if (node.hasAttribute(QUESTION_TOPICS_ATTRIBUTE) || node.hasAttribute(NOTE_TOPIC_ATTRIBUTE)) return true;
  const surfaceSelector = ".protyle-title[data-node-id], .protyle-breadcrumb__item[data-node-id]";
  if (node.matches(surfaceSelector)) return true;
  return Boolean(node.querySelector([
    `[${QUESTION_TOPICS_ATTRIBUTE}]`,
    `[${NOTE_TOPIC_ATTRIBUTE}]`,
    surfaceSelector,
  ].join(",")));
}

export function topicRelationMutationNeedsRefresh(
  record: MutationRecord,
  trackedElements: ReadonlySet<HTMLElement> = new Set(),
): boolean {
  if (record.type === "attributes") return true;
  if (record.type !== "childList") return false;
  return Array.from(record.addedNodes).some(mutationContainsTopicTarget)
    || Array.from(record.removedNodes).some((node) => {
      if (!(node instanceof HTMLElement)) return false;
      const blockId = node.getAttribute("data-node-id");
      if (blockId && (
        node.hasAttribute(QUESTION_TOPICS_ATTRIBUTE)
        || node.hasAttribute(NOTE_TOPIC_ATTRIBUTE)
      )) return true;
      return Array.from(trackedElements).some((element) => node.contains(element));
    });
}

function transactionTouchesTrackedBlock(
  message: IWebSocketData,
  trackedBlockIds: ReadonlySet<string>,
): boolean {
  if (message.cmd !== "transactions" || !Array.isArray(message.data)) return false;
  return message.data.some((transaction: {doOperations?: Array<Record<string, unknown>>}) => (
    transaction.doOperations?.some((operation) => {
      const blockId = typeof operation.id === "string"
        ? operation.id
        : typeof operation.blockID === "string" ? operation.blockID : undefined;
      return Boolean(blockId && trackedBlockIds.has(blockId));
    }) ?? false
  ));
}

export default class TopicRelationsPlugin extends SubPluginBase {
  private observer?: MutationObserver;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private styleElement?: HTMLStyleElement;
  private readonly panel = new TopicRelationPanel();
  private cacheKey = "";
  private cache?: Promise<Map<string, TopicRelationGroup>>;
  private trackedBlockIds = new Set<string>();
  private trackedElements = new Set<HTMLElement>();
  private refreshRunning = false;
  private refreshQueued = false;
  private listening = false;
  private readonly dictionaryStore = new TopicDictionaryStore(
    new SiyuanPluginStoreFileIO(plugin, siyuanKernelClient),
    siyuanKernelClient,
  );
  private progressRuntime?: TinyBaseRuntime;
  private progressLoader?: QuestionProgressLoader;
  private fallbackProgressCache = new Map<string, QuestionProgress | null>();
  private fallbackProgressLoad?: Promise<void>;
  private fallbackProgressThreshold?: number;
  private readonly handleEditorLoaded = (): void => this.scheduleRefresh();
  private readonly handleSyncEnd = (): void => this.invalidateAndRefresh();
  private readonly handleDictionaryUpdated = (): void => this.invalidateAndRefresh();
  private readonly handleProgressUpdated = (): void => {
    this.fallbackProgressCache.clear();
    this.fallbackProgressThreshold = undefined;
    this.invalidateAndRefresh(80);
  };
  private readonly handleWsMain = (event: CustomEvent<IEventBusMap["ws-main"]>): void => {
    if (transactionTouchesTrackedBlock(event.detail, this.trackedBlockIds)) this.invalidateAndRefresh(180);
  };

  override onload(): void {
    this.onunload();
    if (!getQuestionProgressLoader()) {
      this.progressLoader = async (blockIds) => {
        const validBlockIds = [...new Set(blockIds.filter((id) => /^\d{14}-[a-z0-9]{7}$/u.test(id)))];
        if (validBlockIds.length === 0) return new Map();
        const threshold = Number(this.getSetting("reviewThreshold")) || 2;
        if (this.fallbackProgressThreshold !== undefined && this.fallbackProgressThreshold !== threshold) {
          this.fallbackProgressCache.clear();
        }
        this.fallbackProgressThreshold = threshold;
        await this.ensureFallbackProgress(validBlockIds);
        return new Map(validBlockIds.flatMap((blockId) => {
          const aggregate = this.fallbackProgressCache.get(blockId);
          return aggregate ? [[blockId, aggregate] as const] : [];
        }));
      };
      setQuestionProgressLoader(this.progressLoader);
    }
    this.installStyles();
    this.observer = new MutationObserver((records) => {
      let invalidate = false;
      let refresh = false;
      for (const record of records) {
        if (record.type === "attributes") {
          invalidate = true;
          refresh = true;
          break;
        }
        if (record.type === "childList") {
          if (topicRelationMutationNeedsRefresh(record, this.trackedElements)) {
            invalidate = true;
            refresh = true;
            break;
          }
        }
      }
      if (invalidate) this.invalidateCache();
      if (refresh) this.scheduleRefresh(80);
    });
    this.observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [QUESTION_TOPICS_ATTRIBUTE, NOTE_TOPIC_ATTRIBUTE],
    });
    this.listen();
    this.scheduleRefresh();
  }

  override onunload(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    this.panel.destroy();
    removeTopicRelationMarkers(document);
    this.styleElement?.remove();
    this.styleElement = undefined;
    this.invalidateCache();
    this.progressRuntime = undefined;
    this.fallbackProgressCache.clear();
    this.fallbackProgressLoad = undefined;
    this.fallbackProgressThreshold = undefined;
    if (this.progressLoader && getQuestionProgressLoader() === this.progressLoader) {
      setQuestionProgressLoader(undefined);
    }
    this.progressLoader = undefined;
    this.trackedBlockIds.clear();
    this.trackedElements.clear();
    this.refreshRunning = false;
    this.refreshQueued = false;
    this.unlisten();
  }

  private listen(): void {
    if (this.listening) return;
    this.listening = true;
    plugin.eventBus.on("loaded-protyle-static", this.handleEditorLoaded);
    plugin.eventBus.on("loaded-protyle-dynamic", this.handleEditorLoaded);
    plugin.eventBus.on("switch-protyle", this.handleEditorLoaded);
    plugin.eventBus.on("sync-end", this.handleSyncEnd);
    plugin.eventBus.on("ws-main", this.handleWsMain);
    window.addEventListener(TOPIC_DICTIONARY_UPDATED_EVENT, this.handleDictionaryUpdated);
    window.addEventListener(TINYBASE_READ_VIEW_UPDATED_EVENT, this.handleProgressUpdated);
    window.addEventListener("damophus-question-progress-loader-updated", this.handleProgressUpdated);
  }

  private unlisten(): void {
    if (!this.listening) return;
    plugin.eventBus.off("loaded-protyle-static", this.handleEditorLoaded);
    plugin.eventBus.off("loaded-protyle-dynamic", this.handleEditorLoaded);
    plugin.eventBus.off("switch-protyle", this.handleEditorLoaded);
    plugin.eventBus.off("sync-end", this.handleSyncEnd);
    plugin.eventBus.off("ws-main", this.handleWsMain);
    window.removeEventListener(TOPIC_DICTIONARY_UPDATED_EVENT, this.handleDictionaryUpdated);
    window.removeEventListener(TINYBASE_READ_VIEW_UPDATED_EVENT, this.handleProgressUpdated);
    window.removeEventListener("damophus-question-progress-loader-updated", this.handleProgressUpdated);
    this.listening = false;
  }

  private installStyles(): void {
    this.styleElement?.remove();
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = buildTopicRelationStyles(
      this.getSetting("customStyle") ?? DEFAULT_TOPIC_RELATION_STYLE,
    );
    document.head.append(style);
    this.styleElement = style;
  }

  private scheduleRefresh(delay = 0): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.runRefresh();
    }, delay);
  }

  private async runRefresh(): Promise<void> {
    if (this.refreshRunning) {
      this.refreshQueued = true;
      return;
    }
    this.refreshRunning = true;
    try {
      do {
        this.refreshQueued = false;
        await this.refresh();
      } while (this.refreshQueued);
    } finally {
      this.refreshRunning = false;
    }
  }

  private invalidateAndRefresh(delay = 0): void {
    this.invalidateCache();
    this.scheduleRefresh(delay);
  }

  private invalidateCache(): void {
    this.cacheKey = "";
    this.cache = undefined;
  }

  private async ensureFallbackProgress(blockIds: readonly string[]): Promise<void> {
    const missing = blockIds.filter((blockId) => !this.fallbackProgressCache.has(blockId));
    if (missing.length === 0) return;
    if (this.fallbackProgressLoad) {
      await this.fallbackProgressLoad;
      return this.ensureFallbackProgress(blockIds);
    }
    const load = (async () => {
      this.progressRuntime ??= new TinyBaseRuntime(new TinyBaseWarehouse(
        new SiyuanPluginStoreFileIO(plugin, siyuanKernelClient),
        currentDeviceId(),
      ));
      await this.progressRuntime.mergeAfterSync().catch(() => undefined);
      const chunks: string[][] = [];
      for (let offset = 0; offset < missing.length; offset += PROGRESS_BLOCK_CHUNK_SIZE) {
        chunks.push(missing.slice(offset, offset + PROGRESS_BLOCK_CHUNK_SIZE));
      }
      const [rows, aggregates] = await Promise.all([
        (await Promise.all(chunks.map((chunk) => requestStrict<Array<{
          block_id: string;
          attribute_value: string;
        }>>(
          "/api/query/sql",
          {stmt: `SELECT block_id, value AS attribute_value FROM attributes WHERE name = 'custom-qb-id' AND block_id IN (${chunk
            .map((id) => `'${id}'`).join(", ")})`},
        )))).flat(),
        this.progressRuntime.loadAggregates(),
      ]);
      const questionIds = new Map(rows.map((row) => [row.block_id, row.attribute_value]));
      const threshold = this.fallbackProgressThreshold ?? 2;
      missing.forEach((blockId) => {
        const questionId = questionIds.get(blockId);
        const aggregate = questionId ? aggregates.get(questionId) : undefined;
        this.fallbackProgressCache.set(
          blockId,
          aggregate ? questionProgressFromAggregate(aggregate, threshold) : null,
        );
      });
    })();
    this.fallbackProgressLoad = load;
    try {
      await load;
    } finally {
      if (this.fallbackProgressLoad === load) this.fallbackProgressLoad = undefined;
    }
  }

  private labels(): TopicRelationLabels {
    return {
      topics: this.t("lets-topic-relations.topics"),
      topicNote: this.t("lets-topic-relations.topicNote"),
      topicNotes: this.t("lets-topic-relations.topicNotes"),
      otherTopicNotes: this.t("lets-topic-relations.otherTopicNotes"),
      relatedQuestions: this.t("lets-topic-relations.relatedQuestions"),
      unresolved: this.t("lets-topic-relations.unresolved"),
      loadFailed: this.t("lets-topic-relations.loadFailed"),
      retry: this.t("lets-topic-relations.retry"),
      openRelations: this.t("lets-topic-relations.openRelations"),
      more: this.t("lets-topic-relations.more"),
      all: this.t("lets-topic-relations.all"),
      currentDocument: this.t("lets-topic-relations.currentDocument"),
      outsideDocument: this.t("lets-topic-relations.outsideDocument"),
    };
  }

  private panelOptions(): TopicRelationPanelOptions {
    return {
      mobile: isMobile,
      mobileHeight: clampMobilePanelHeight(
        this.getSetting("mobilePanelHeight") ?? DEFAULT_MOBILE_PANEL_HEIGHT,
      ),
      nativeHover: this.getSetting("nativeHover") !== false,
      labels: {
        topicNotes: this.t("lets-topic-relations.topicNotes"),
        otherTopicNotes: this.t("lets-topic-relations.otherTopicNotes"),
        relatedQuestions: this.t("lets-topic-relations.relatedQuestions"),
        empty: this.t("lets-topic-relations.empty"),
        pin: this.t("lets-topic-relations.pin"),
        unpin: this.t("lets-topic-relations.unpin"),
        close: this.t("lets-topic-relations.close"),
      },
    };
  }

  private async refresh(): Promise<void> {
    const inlineTargets = findTopicRelationTargets(document);
    const surfaceCandidates = findTopicRelationSurfaceCandidates(document);
    if (inlineTargets.length === 0 && surfaceCandidates.length === 0) {
      removeTopicRelationMarkers(document);
      this.trackedBlockIds.clear();
      this.trackedElements.clear();
      return;
    }
    try {
      const surfaceTargets = await this.querySurfaceTargets(surfaceCandidates);
      const targets = [...inlineTargets, ...surfaceTargets];
      const topicIds = collectTargetTopicIds(targets);
      if (targets.length === 0 || topicIds.length === 0) {
        removeTopicRelationMarkers(document);
        this.trackedBlockIds = new Set(surfaceCandidates.map((candidate) => candidate.blockId));
        this.trackedElements = new Set(surfaceCandidates.map((candidate) => candidate.element));
        return;
      }
      const index = await this.loadIndex(topicIds);
      this.trackedBlockIds = new Set([
        ...surfaceCandidates.map((candidate) => candidate.blockId),
        ...targets.map((target) => target.blockId),
        ...Array.from(index.values()).flatMap((group) => [
          ...group.notes.map((entry) => entry.blockId),
          ...group.questions.map((entry) => entry.blockId),
        ]),
      ]);
      this.trackedElements = new Set(targets.map((target) => target.element));
      syncTopicRelationMarkers(document, targets, index, {
        displayMode: validDisplayMode(this.getSetting("displayMode")),
        nativeHover: this.getSetting("nativeHover") !== false,
        labels: this.labels(),
        onRetry: () => this.invalidateAndRefresh(),
        onOpen: (anchor, group, hostBlockId, preferredGroup, scope) => {
          this.panel.open(anchor, group, hostBlockId, preferredGroup, this.panelOptions(), scope);
        },
      });
    } catch (error) {
      log.warn("topic-relations.load-failed", error);
      syncTopicRelationMarkers(document, inlineTargets, new Map(), {
        displayMode: validDisplayMode(this.getSetting("displayMode")),
        nativeHover: this.getSetting("nativeHover") !== false,
        labels: this.labels(),
        error: error instanceof Error ? error.message : String(error),
        onRetry: () => this.invalidateAndRefresh(),
        onOpen: () => {},
      });
    }
  }

  private loadIndex(topicIds: readonly string[]): Promise<Map<string, TopicRelationGroup>> {
    const prioritySource = this.getSetting("sourcePriority") ?? DEFAULT_SOURCE_PRIORITY;
    const normalizedIds = [...topicIds].sort();
    const key = `${normalizedIds.join(",")}::${String(prioritySource)}`;
    if (this.cache && this.cacheKey === key) return this.cache;
    this.cacheKey = key;
    this.cache = Promise.all([
      this.queryRows(normalizedIds),
      this.dictionaryStore.load().catch((error) => {
        log.warn("topic-dictionary.load-failed", error);
        return undefined;
      }),
    ])
      .then(async ([rows, dictionary]) => {
        const groups = buildTopicRelationIndex(normalizedIds, rows, parsePriorityRules(prioritySource), dictionary);
        const loader = getQuestionProgressLoader();
        if (!loader) return groups;
        const entries = Array.from(groups.values()).flatMap((group) => group.questions);
        const progress = await loader([...new Set(entries.map((entry) => entry.blockId))]);
        for (const entry of entries) entry.progress = progress.get(entry.blockId);
        return groups;
      })
      .catch((error) => {
        this.invalidateCache();
        throw error;
      });
    return this.cache;
  }

  private async queryRows(topicIds: readonly string[]): Promise<TopicRelationSqlRow[]> {
    const normalized = [...new Set(topicIds)];
    const chunks: string[][] = [];
    for (let offset = 0; offset < normalized.length; offset += QUERY_CHUNK_SIZE) {
      chunks.push(normalized.slice(offset, offset + QUERY_CHUNK_SIZE));
    }
    const results = await Promise.all(chunks.map((chunk) => requestStrict<TopicRelationSqlRow[]>(
      "/api/query/sql",
      { stmt: buildTopicRelationSql(chunk) },
    )));
    return results.flat();
  }

  private async querySurfaceTargets(
    candidates: readonly TopicRelationSurfaceCandidate[],
  ) {
    if (candidates.length === 0) return [];
    const blockIds = [...new Set(candidates.map((candidate) => candidate.blockId))];
    const chunks: string[][] = [];
    for (let offset = 0; offset < blockIds.length; offset += PROGRESS_BLOCK_CHUNK_SIZE) {
      chunks.push(blockIds.slice(offset, offset + PROGRESS_BLOCK_CHUNK_SIZE));
    }
    const rows = (await Promise.all(chunks.map((chunk) => requestStrict<TopicRelationAttributeRow[]>(
      "/api/query/sql",
      { stmt: buildTopicRelationAttributeSql(chunk) },
    )))).flat();
    return buildSurfaceTopicRelationTargets(candidates, rows);
  }
}

export { transactionTouchesTrackedBlock };
