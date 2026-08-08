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
} from "./topic-relations";
import {
  removeTopicRelationMarkers,
  syncTopicRelationMarkers,
  type TopicRelationLabels,
} from "./topic-relation-dom";
import { TopicRelationPanel, type TopicRelationPanelOptions } from "./topic-relation-panel";
import { buildTopicRelationStyles } from "./topic-relation-styles";

const log = getLogger("lets-topic-relations");
const STYLE_ID = "damophus-topic-relations-style";
const QUERY_CHUNK_SIZE = 24;

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
  private listening = false;
  private readonly handleEditorLoaded = (): void => this.scheduleRefresh();
  private readonly handleSyncEnd = (): void => this.invalidateAndRefresh();
  private readonly handleWsMain = (event: CustomEvent<IEventBusMap["ws-main"]>): void => {
    if (transactionTouchesTrackedBlock(event.detail, this.trackedBlockIds)) this.invalidateAndRefresh(180);
  };

  override onload(): void {
    this.onunload();
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
          const changed = [...record.addedNodes, ...record.removedNodes].some(mutationContainsTopicTarget);
          if (changed) {
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
    this.trackedBlockIds.clear();
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
  }

  private unlisten(): void {
    if (!this.listening) return;
    plugin.eventBus.off("loaded-protyle-static", this.handleEditorLoaded);
    plugin.eventBus.off("loaded-protyle-dynamic", this.handleEditorLoaded);
    plugin.eventBus.off("switch-protyle", this.handleEditorLoaded);
    plugin.eventBus.off("sync-end", this.handleSyncEnd);
    plugin.eventBus.off("ws-main", this.handleWsMain);
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
      void this.refresh();
    }, delay);
  }

  private invalidateAndRefresh(delay = 0): void {
    this.invalidateCache();
    this.scheduleRefresh(delay);
  }

  private invalidateCache(): void {
    this.cacheKey = "";
    this.cache = undefined;
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
      return;
    }
    try {
      const surfaceTargets = await this.querySurfaceTargets(surfaceCandidates);
      const targets = [...inlineTargets, ...surfaceTargets];
      const topicIds = collectTargetTopicIds(targets);
      if (targets.length === 0 || topicIds.length === 0) {
        removeTopicRelationMarkers(document);
        this.trackedBlockIds = new Set(surfaceCandidates.map((candidate) => candidate.blockId));
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
      syncTopicRelationMarkers(document, targets, index, {
        displayMode: validDisplayMode(this.getSetting("displayMode")),
        nativeHover: this.getSetting("nativeHover") !== false,
        labels: this.labels(),
        onRetry: () => this.invalidateAndRefresh(),
        onOpen: (anchor, group, hostBlockId, preferredGroup) => {
          this.panel.open(anchor, group, hostBlockId, preferredGroup, this.panelOptions());
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
    this.cache = this.queryRows(normalizedIds)
      .then((rows) => buildTopicRelationIndex(
        normalizedIds,
        rows,
        parsePriorityRules(prioritySource),
      ))
      .catch((error) => {
        this.invalidateCache();
        throw error;
      });
    return this.cache;
  }

  private async queryRows(topicIds: readonly string[]): Promise<TopicRelationSqlRow[]> {
    const chunks: string[][] = [];
    for (let offset = 0; offset < topicIds.length; offset += QUERY_CHUNK_SIZE) {
      chunks.push(topicIds.slice(offset, offset + QUERY_CHUNK_SIZE));
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
    const rows = await requestStrict<TopicRelationAttributeRow[]>(
      "/api/query/sql",
      { stmt: buildTopicRelationAttributeSql(candidates.map((candidate) => candidate.blockId)) },
    );
    return buildSurfaceTopicRelationTargets(candidates, rows);
  }
}

export { transactionTouchesTrackedBlock };
