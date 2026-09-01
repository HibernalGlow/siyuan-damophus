<script lang="ts">
  import { onMount } from "svelte";
  import { Archive, Database, History, Search, SlidersHorizontal } from "lucide-svelte";
  import * as Tabs from "@/components/ui/tabs";
  import { type FlashcardDiagnosticRow, type FlashcardGroup, type FlashcardReviewHistoryItem, type FlashcardReviewScope, type FlashcardReviewStatKey, type FlashcardSettings } from "@/flashcard/types";
  import type { FlashcardCategoryConfig, FlashcardCategoryRule } from "@/flashcard/category-module";
  import type { OpenFlashcardDocument } from "@/flashcard/open-documents";
  import type { RiffCardRecord } from "@/flashcard/siyuan-adapter";
  import type { FlashcardRuntime } from "@/flashcard/runtime";
  import { getReviewToolbarActions, type ReviewToolbarAction } from "@/flashcard/review-action-registry";
  import { DEFAULT_DOCUMENT_PATH_HIGHLIGHTS } from "@/libs/document-path-highlights";
  import {
    filterReviewLogEntries,
    type ReviewLogCardContext,
    type ReviewLogArchive,
    type ReviewLogSelection,
  } from "@/flashcard/review-log-export";
  import type { FsrsOptimizationResult } from "@/flashcard/fsrs-optimizer-protocol";
  import type { FsrsWeightPreview } from "@/flashcard/fsrs-settings-adapter";
  import type { FsrsWeightHistoryEntry } from "@/flashcard/fsrs-weight-history";
  import SettingsHeader from "./settings/SettingsHeader.svelte";
  import RecentScopesPanel from "./settings/RecentScopesPanel.svelte";
  import BrowserPanel from "./settings/BrowserPanel.svelte";
  import ReviewLogPanel from "./settings/ReviewLogPanel.svelte";
  import FsrsOptimizerPanel from "./settings/FsrsOptimizerPanel.svelte";
  import GlobalSettingsPanel from "./settings/GlobalSettingsPanel.svelte";
  import GroupsPanel from "./settings/GroupsPanel.svelte";
  import { createReviewLogWorkbench } from "./settings/review-log-workbench";

  export let runtime: FlashcardRuntime;
  export let onReviewGroup: (group: FlashcardGroup) => void;
  export let onMakeGroup: (group: FlashcardGroup) => void = () => undefined;
  export let onReviewAll: () => void;
  export let onViewResults: (group: FlashcardGroup, filtered: boolean) => void;
  export let onOpenRaw: (group: FlashcardGroup) => void;
  export let onOpenFiltered: (group: FlashcardGroup) => void;
  export let onBatchPriority: (group: FlashcardGroup) => void;
  export let onImportSfp: () => void | Promise<void>;
  export let onReviewScope: (scope: FlashcardReviewScope) => void;
  export let onMakeScope: (scope: FlashcardReviewScope) => void = () => undefined;
  export let onLoadOpenDocuments: () => Promise<OpenFlashcardDocument[]> = async () => [];
  export let onLocateCard: (card: RiffCardRecord) => void;
  export let onUnregisterCard: (card: RiffCardRecord) => void;
  export let onSetCardPriority: (card: RiffCardRecord, priority: number) => void;
  export let onSettingsChanged: () => void;
  export let onOptimizeReviewLog: (entries: ReviewLogArchive["entries"]) => Promise<{
    result: FsrsOptimizationResult;
    preview: FsrsWeightPreview;
  }>;
  export let onApplyFsrsWeights: (weights: number[]) => Promise<boolean>;
  export let onGetFsrsWeights: () => number[] = () => [];
  export let onLoadFsrsHistory: () => Promise<FsrsWeightHistoryEntry[]> = async () => [];
  export let onUndoFsrsWeights: (entry: FsrsWeightHistoryEntry) => Promise<boolean> = async () => false;
  export let categoryConfig: FlashcardCategoryConfig | undefined = undefined;
  export let onSaveCategoryConfig: (config: FlashcardCategoryConfig) => void | Promise<void> = () => undefined;
  export let documentPathHighlights: string[] = [...DEFAULT_DOCUMENT_PATH_HIGHLIGHTS];
  export let onDocumentPathHighlightsChange: (next: string[]) => void = () => {};

  let config: FlashcardSettings = runtime.getSettings();
  let toolbarActions: ReviewToolbarAction[] = getReviewToolbarActions();
  let message = "";
  let saving = false;
  let workbenchMode: "make" | "review" = "make";
  let activeTab: "recent" | "groups" | "browser" | "revlog" | "global" = "recent";
  let activeCategoryId = config.categories[0]?.id ?? "default";
  let editingCategoryId: string | undefined;
  let editingCategoryName = "";
  let visibleGroups: FlashcardGroup[] = [];
  let history = runtime.getHistory();
  let diagnosticRows: FlashcardDiagnosticRow[] = [];
  let browserLoading = false;
  let browserQuery = "";
  let browserPriority = "all";
  let browserRenderer = "all";
  let browserDueOnly = false;
  let visibleDiagnostics: FlashcardDiagnosticRow[] = [];
  let reviewLogArchive: ReviewLogArchive | undefined;
  let reviewLogLoading = false;
  let reviewLogContextLoading = false;
  let reviewLogContextError = "";
  let reviewLogContexts: ReviewLogCardContext[] = [];
  let reviewLogFrom = "";
  let reviewLogTo = "";
  let reviewLogNotebook = "";
  let reviewLogDocument = "";
  let reviewLogDocumentQuery = "";
  let reviewLogIncludeSubdocuments = true;
  let reviewLogState = "";
  let reviewLogDocuments: Array<{ id: string; label: string }> = [];
  let filteredReviewLogDocuments: Array<{ id: string; label: string }> = [];
  let reviewLogNotebooks: Array<{ id: string; label: string }> = [];
  let optimizerLoading = false;
  let optimizerApplying = false;
  let optimizerApplied = false;
  let optimization: { result: FsrsOptimizationResult; preview: FsrsWeightPreview } | undefined;
  let currentFsrsWeights: number[] = [];
  let fsrsHistory: FsrsWeightHistoryEntry[] = [];
  let fsrsHistoryLoading = false;
  let fsrsUndoingId = "";
  let documentTreeOpen = true;
  let applicationTreeOpen = true;
  let readablePaths: Record<string, string> = {};
  let openDocuments: OpenFlashcardDocument[] = [];
  let openDocumentsLoading = false;
  let highlightPatterns = [...documentPathHighlights];
  const requestedPathIds = new Set<string>();

  $: toolbarActionRows = (() => {
    const byId = new Map(toolbarActions.map((action) => [action.id, action]));
    const configured = config.reviewToolbarActionOrder.filter((id) => byId.has(id));
    const missing = toolbarActions.map((action) => action.id).filter((id) => !configured.includes(id));
    return [...configured, ...missing].map((id) => ({
      action: byId.get(id)!,
      enabled: configured.includes(id),
    }));
  })();
  $: activeCategoryId = config.categories.some((category) => category.id === activeCategoryId)
    ? activeCategoryId
    : config.categories[0]?.id ?? "default";
  $: visibleGroups = config.groups.filter((group) => group.categoryId === activeCategoryId);
  $: visibleDiagnostics = diagnosticRows.filter((row) => {
    const query = browserQuery.trim().toLowerCase();
    if (query && !`${row.blockId} ${row.cardId ?? ""} ${row.content ?? ""} ${row.groupNames.join(" ")}`.toLowerCase().includes(query)) return false;
    if (browserPriority !== "all" && (row.priorityConflict ? "conflict" : row.priority ?? "none") !== browserPriority) return false;
    if (browserRenderer !== "all" && row.renderer !== browserRenderer) return false;
    return !browserDueOnly || row.due;
  }).slice(0, 300);
  $: reviewLogContextMap = new Map(reviewLogContexts.map((context) => [context.cardId, context]));
  $: reviewLogSelection = buildReviewLogSelection(reviewLogFrom, reviewLogTo, reviewLogNotebook, reviewLogDocument, reviewLogState, reviewLogIncludeSubdocuments);
  $: selectedReviewLogEntries = reviewLogArchive
    ? filterReviewLogEntries(reviewLogArchive.entries, reviewLogSelection, reviewLogContextMap)
    : [];
  $: reviewLogDocuments = (() => {
    const documents = new Map<string, { id: string; label: string }>();
    for (const context of reviewLogContexts) {
      const path = context.documentPath?.trim();
      if (!path) continue;
      if (context.documentId) documents.set(context.documentId, { id: context.documentId, label: path });
      const segments = path.replace(/\\/gu, "/").split("/").filter(Boolean);
      for (let index = 1; index < segments.length; index += 1) {
        const ancestor = `/${segments.slice(0, index).join("/")}`;
        const virtualId = `path:${ancestor}`;
        if (!documents.has(virtualId)) documents.set(virtualId, { id: virtualId, label: ancestor });
      }
    }
    return [...documents.values()].sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
  })();
  $: filteredReviewLogDocuments = reviewLogDocumentQuery.trim()
    ? reviewLogDocuments.filter((document) => `${document.id} ${document.label}`.toLowerCase().includes(reviewLogDocumentQuery.trim().toLowerCase())).slice(0, 40)
    : [];
  $: reviewLogNotebooks = [...new Map(reviewLogContexts
    .filter((context) => context.notebookId)
    .map((context) => [context.notebookId!, { id: context.notebookId!, label: context.notebookName ?? context.notebookId! }])).values()]
    .sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
  $: documentHistory = history.filter((scope) => !scope.groupName && scope.type !== "group");
  $: applicationScopeGroups = groupApplicationScopes(history.filter((scope) => Boolean(scope.groupName) || scope.type === "group"));
  function scopeBlockId(scope: FlashcardReviewScope): string {
    const candidate = `${scope.targetId ?? ""} ${scope.targetName} ${scope.id}`;
    return candidate.match(/\d{14}-[a-z0-9]{7}/u)?.[0] ?? "";
  }

  function openDocumentScope(document: OpenFlashcardDocument, group?: FlashcardGroup): FlashcardReviewScope {
    return {
      id: `document:${document.documentId}:${group?.id ?? "all"}`,
      type: "document",
      targetId: document.documentId,
      targetName: document.path || document.title,
      groupId: group?.id,
      groupName: group?.name,
    };
  }

  function reviewOpenDocument(document: OpenFlashcardDocument, group?: FlashcardGroup): void {
    const scope = openDocumentScope(document, group);
    if (workbenchMode === "make") onMakeScope(scope);
    else onReviewScope(scope);
  }

  function openHistoryScope(scope: FlashcardReviewScope): void {
    if (workbenchMode === "make") onMakeScope(scope);
    else onReviewScope(scope);
  }

  function openGroup(group: FlashcardGroup): void {
    if (workbenchMode === "make") onMakeGroup(group);
    else onReviewGroup(group);
  }

  async function loadOpenDocuments(): Promise<void> {
    openDocumentsLoading = true;
    try {
      openDocuments = await onLoadOpenDocuments();
    } catch (error) {
      message = `读取当前打开文档失败：${error instanceof Error ? error.message : String(error)}`;
      openDocuments = [];
    } finally {
      openDocumentsLoading = false;
    }
  }

  function groupApplicationScopes(scopes: FlashcardReviewHistoryItem[]): Array<{ name: string; scopes: FlashcardReviewHistoryItem[] }> {
    const groups = new Map<string, FlashcardReviewHistoryItem[]>();
    for (const scope of scopes) {
      const name = scope.groupName ?? scope.targetName;
      groups.set(name, [...(groups.get(name) ?? []), scope]);
    }
    return [...groups].map(([name, groupedScopes]) => ({ name, scopes: groupedScopes }));
  }

  function localDateBoundary(value: string, end = false): number | undefined {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return undefined;
    if (end && /^\d{4}-\d{2}-\d{2}$/u.test(value)) parsed.setHours(23, 59, 59, 999);
    return parsed.getTime();
  }

  function buildReviewLogSelection(from: string, to: string, notebook: string, document: string, state: string, includeSubdocuments: boolean): ReviewLogSelection {
    const selectedDocument = reviewLogDocuments.find((item) => item.id === document);
    const documentId = document && !document.startsWith("path:") ? document : undefined;
    const selection: ReviewLogSelection = {
      fromReviewed: localDateBoundary(from),
      toReviewed: localDateBoundary(to, true),
      notebookId: notebook || undefined,
      documentId,
      documentPath: selectedDocument?.label,
      includeSubdocuments: document ? includeSubdocuments : undefined,
      state: state ? Number(state) : undefined,
    };
    return Object.fromEntries(Object.entries(selection).filter(([, value]) => value !== undefined)) as ReviewLogSelection;
  }

  type DocumentPickerValue = string | { id?: string; documentId?: string; blockId?: string; path?: string; hpath?: string; name?: string };

  function applyReviewLogDocumentValue(value: DocumentPickerValue): boolean {
    const candidate = typeof value === "string" ? { id: value, path: value } : value;
    const id = candidate.documentId || candidate.blockId || candidate.id || "";
    const path = candidate.hpath || candidate.path || candidate.name || "";
    const match = reviewLogDocuments.find((document) => document.id === id || document.label === path || document.id === path);
    if (!match) {
      reviewLogDocumentQuery = path || id;
      message = "未在复习记录中找到该文档；请先扫描，或检查文档 ID / 路径是否正确";
      return false;
    }
    reviewLogDocument = match.id;
    reviewLogDocumentQuery = match.label;
    message = `已选择文档：${match.label}`;
    return true;
  }

  function applyReviewLogDocumentQuery(): void {
    const query = reviewLogDocumentQuery.trim();
    if (!query) {
      reviewLogDocument = "";
      return;
    }
    const exact = reviewLogDocuments.find((document) => document.id === query || document.label === query);
    const uniqueMatch = filteredReviewLogDocuments.length === 1 ? filteredReviewLogDocuments[0] : undefined;
    applyReviewLogDocumentValue(exact ?? uniqueMatch ?? query);
  }

  const reviewLogWorkbench = createReviewLogWorkbench({
    state: {
      get config() { return config; },
      get message() { return message; },
      set message(value) { message = value; },
      get reviewLogArchive() { return reviewLogArchive; },
      set reviewLogArchive(value) { reviewLogArchive = value; },
      get reviewLogLoading() { return reviewLogLoading; },
      set reviewLogLoading(value) { reviewLogLoading = value; },
      get reviewLogContextLoading() { return reviewLogContextLoading; },
      set reviewLogContextLoading(value) { reviewLogContextLoading = value; },
      get reviewLogContextError() { return reviewLogContextError; },
      set reviewLogContextError(value) { reviewLogContextError = value; },
      get reviewLogContexts() { return reviewLogContexts; },
      set reviewLogContexts(value) { reviewLogContexts = value; },
      get reviewLogDocuments() { return reviewLogDocuments; },
      get filteredReviewLogDocuments() { return filteredReviewLogDocuments; },
      get optimizerLoading() { return optimizerLoading; },
      set optimizerLoading(value) { optimizerLoading = value; },
      get optimizerApplying() { return optimizerApplying; },
      set optimizerApplying(value) { optimizerApplying = value; },
      get optimizerApplied() { return optimizerApplied; },
      set optimizerApplied(value) { optimizerApplied = value; },
      get optimization() { return optimization; },
      set optimization(value) { optimization = value; },
      get currentFsrsWeights() { return currentFsrsWeights; },
      set currentFsrsWeights(value) { currentFsrsWeights = value; },
      get fsrsHistory() { return fsrsHistory; },
      set fsrsHistory(value) { fsrsHistory = value; },
      get fsrsHistoryLoading() { return fsrsHistoryLoading; },
      set fsrsHistoryLoading(value) { fsrsHistoryLoading = value; },
      get fsrsUndoingId() { return fsrsUndoingId; },
      set fsrsUndoingId(value) { fsrsUndoingId = value; },
      get selectedReviewLogEntries() { return selectedReviewLogEntries; },
    },
    runtime,
    onOptimizeReviewLog,
    onApplyFsrsWeights,
    onGetFsrsWeights,
    onLoadFsrsHistory,
    onUndoFsrsWeights,
    onPickDocument: (value) => applyReviewLogDocumentValue(value),
  });
  const {
    openOfficialDocumentPicker,
    scanReviewLogs,
    exportMergedReviewLog,
    exportMonthlyReviewLogs,
    optimizeReviewLogs,
    applyOptimization,
    loadFsrsHistory,
    undoFsrsHistory,
  } = reviewLogWorkbench;

  onMount(() => {
    toolbarActions = getReviewToolbarActions();
    const refreshToolbarActions = window.setInterval(() => {
      const next = getReviewToolbarActions();
      if (next.map((action) => action.id).join("\0") !== toolbarActions.map((action) => action.id).join("\0")) toolbarActions = next;
    }, 1000);
    currentFsrsWeights = onGetFsrsWeights();
    void loadFsrsHistory();
    void loadOpenDocuments();
    return () => window.clearInterval(refreshToolbarActions);
  });

  async function ensureReadablePaths(ids: string[]): Promise<void> {
    const pending = [...new Set(ids.filter(Boolean))].filter((id) => !requestedPathIds.has(id));
    if (pending.length === 0) return;
    pending.forEach((id) => requestedPathIds.add(id));
    const entries = await Promise.all(pending.map(async (id) => {
      try {
        return [id, await runtime.getReadablePath(id)] as const;
      } catch {
        return [id, "文档路径不可用"] as const;
      }
    }));
    readablePaths = { ...readablePaths, ...Object.fromEntries(entries) };
  }

  void ensureReadablePaths(history.map(scopeBlockId));

  function reload(): void {
    config = runtime.getSettings();
    if (!config.categories.some((category) => category.id === activeCategoryId)) {
      activeCategoryId = config.categories[0]?.id ?? "default";
    }
  }

  function updateDocumentPathHighlights(next: string[]): void {
    highlightPatterns = [...next];
    onDocumentPathHighlightsChange(highlightPatterns);
  }

  async function saveConfig(): Promise<void> {
    saving = true;
    try {
      await runtime.saveSettings(config);
      onSettingsChanged();
      message = "已保存闪卡设置";
    } catch (error) {
      message = `保存失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      saving = false;
    }
  }

  async function togglePinned(scope: FlashcardReviewScope & { pinned?: boolean }): Promise<void> {
    await runtime.setScopePinned(scope.id, !scope.pinned);
    history = runtime.getHistory();
    void ensureReadablePaths(history.map(scopeBlockId));
  }

  async function removeHistory(scopeId: string): Promise<void> {
    await runtime.removeScopeHistory(scopeId);
    history = runtime.getHistory();
  }

  async function loadDiagnostics(): Promise<void> {
    browserLoading = true;
    try {
      diagnosticRows = await runtime.buildDiagnostics();
      await ensureReadablePaths(diagnosticRows.map((row) => row.blockId));
      message = `已加载 ${diagnosticRows.length} 张已登记闪卡`;
    } catch (error) {
      message = `闪卡浏览器加载失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      browserLoading = false;
    }
  }

  function setPriority(row: FlashcardDiagnosticRow, priority: number): void {
    onSetCardPriority(row.card, priority);
    window.setTimeout(() => void loadDiagnostics(), 300);
  }

  async function saveGroup(group: FlashcardGroup): Promise<void> {
    if (!group.name.trim() || !group.sqlQuery.trim()) {
      message = "分组名称和 SQL 查询不能为空";
      return;
    }
    await runtime.saveGroup(group);
    reload();
    message = `已保存分组：${group.name}`;
  }

  async function addGroup(): Promise<void> {
    const group: FlashcardGroup = {
      id: crypto.randomUUID(),
      name: "新分组",
      sqlQuery: "SELECT id FROM blocks WHERE",
      categoryId: activeCategoryId,
      enabled: true,
      queryFirst: true,
      cacheMinutes: config.cacheUpdateInterval,
    };
    await runtime.saveGroup(group);
    reload();
  }

  async function deleteGroup(group: FlashcardGroup): Promise<void> {
    await runtime.deleteGroup(group.id);
    reload();
    message = `已删除分组：${group.name}`;
  }

  async function addCategory(): Promise<void> {
    const id = crypto.randomUUID();
    await runtime.saveCategory({ id, name: "新分类" });
    reload();
  }

  async function deleteCategory(categoryId: string): Promise<void> {
    if (config.categories.length <= 1) return;
    if (!window.confirm("删除分类会同时删除其中的 SQL 分组，确认继续吗？")) return;
    await runtime.deleteCategory(categoryId);
    reload();
  }

  async function renameCategory(category: { id: string; name: string }): Promise<void> {
    if (!category.name.trim()) {
      message = "分类名称不能为空";
      return;
    }
    await runtime.saveCategory(category);
    reload();
  }

  async function moveGroup(group: FlashcardGroup, direction: "up" | "down"): Promise<void> {
    await runtime.reorderGroups(group.categoryId, group.id, direction);
    reload();
  }

  async function updateGlobal(): Promise<void> {
    await saveConfig();
    runtime.startAutomation();
  }

  function saveGlobalOnChange(): void {
    void saveConfig();
    runtime.startAutomation();
  }

  function saveCategoryConfig(): void {
    if (categoryConfig) void onSaveCategoryConfig(categoryConfig);
  }

  function moveCategory(rule: FlashcardCategoryRule, direction: "up" | "down"): void {
    if (!categoryConfig) return;
    const ordered = [...categoryConfig.rules].sort((left, right) => left.reviewOrder - right.reviewOrder);
    const index = ordered.findIndex((item) => item.name === rule.name);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    categoryConfig.rules = categoryConfig.rules.map((item) => ({ ...item, reviewOrder: ordered.findIndex((candidate) => candidate.name === item.name) }));
    saveCategoryConfig();
  }

  function addFlashcardCategoryRule(): void {
    if (!categoryConfig) return;
    const base = "新分类";
    let name = base;
    let index = 2;
    while (categoryConfig.rules.some((rule) => rule.name === name)) name = `${base}${index++}`;
    categoryConfig.rules = [...categoryConfig.rules, { name, participatesInReview: false, reviewOrder: categoryConfig.rules.length, displayOrder: categoryConfig.rules.length, enabled: true }];
    saveCategoryConfig();
  }

  function setBooleanSetting(key: keyof FlashcardSettings, value: boolean): void {
    (config as unknown as Record<string, unknown>)[key] = value;
    saveGlobalOnChange();
  }

  function setToolbarActionEnabled(id: string, enabled: boolean): void {
    const order = config.reviewToolbarActionOrder.filter((item) => item !== id);
    if (enabled) order.push(id);
    config = { ...config, reviewToolbarActionOrder: order };
    saveGlobalOnChange();
  }

  function moveToolbarAction(id: string, direction: "up" | "down"): void {
    const order = [...config.reviewToolbarActionOrder];
    const index = order.indexOf(id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    config = { ...config, reviewToolbarActionOrder: order };
    saveGlobalOnChange();
  }

  function resetToolbarActions(): void {
    config = { ...config, reviewToolbarActionOrder: ["locate", "unregister", "priority", "renderer", "workbench"] };
    saveGlobalOnChange();
  }

  function updateToolbarStyle(key: keyof FlashcardSettings["reviewToolbarStyle"], value: string | number): void {
    config = { ...config, reviewToolbarStyle: { ...config.reviewToolbarStyle, [key]: value } };
    saveGlobalOnChange();
  }

  function moveReviewStat(key: FlashcardReviewStatKey, direction: "up" | "down"): void {
    const order = [...config.reviewStats.order];
    const index = order.indexOf(key);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    config = { ...config, reviewStats: { ...config.reviewStats, order } };
    saveGlobalOnChange();
  }

  async function clearCache(): Promise<void> {
    await runtime.clearCache();
    message = "已清除 SQL 缓存";
  }

  function startCategoryRename(category: { id: string; name: string }): void {
    editingCategoryId = category.id;
    editingCategoryName = category.name;
  }

  function cancelCategoryRename(): void {
    editingCategoryId = undefined;
    editingCategoryName = "";
  }

  async function commitCategoryRename(category: { id: string; name: string }): Promise<void> {
    const name = editingCategoryName.trim();
    if (!name) {
      message = "分类名称不能为空";
      return;
    }
    if (name !== category.name) await renameCategory({ ...category, name });
    cancelCategoryRename();
  }
</script>

<div class="flashcard-settings damophus-theme-root damophus-question-bank-theme" data-testid="flashcard-settings">
  <SettingsHeader
    workbenchMode={workbenchMode}
    config={config}
    onWorkbenchModeChange={(mode) => workbenchMode = mode}
    onReviewAll={onReviewAll}
    onClearCache={clearCache}
    onImportSfp={onImportSfp}
    onSaveGlobalOnChange={saveGlobalOnChange}
  />

  <Tabs.Root bind:value={activeTab}>
    <Tabs.List class="flashcard-workbench-tabs" aria-label="闪卡设置">
      <Tabs.Trigger value="recent" title="最近范围" aria-label="最近范围" onclick={() => history = runtime.getHistory()}><History /><span>最近范围</span></Tabs.Trigger>
      <Tabs.Trigger value="groups" title="SQL 分组" aria-label="SQL 分组"><Database /><span>SQL 分组</span></Tabs.Trigger>
      <Tabs.Trigger value="browser" title="闪卡浏览器" aria-label="闪卡浏览器" onclick={() => { if (diagnosticRows.length === 0) void loadDiagnostics(); }}><Search /><span>闪卡浏览器</span></Tabs.Trigger>
      <Tabs.Trigger value="revlog" title="复习记录" aria-label="复习记录"><Archive /><span>复习记录</span></Tabs.Trigger>
      <Tabs.Trigger value="global" title="总体配置" aria-label="总体配置"><SlidersHorizontal /><span>总体配置</span></Tabs.Trigger>
    </Tabs.List>
  </Tabs.Root>

  {#if activeTab === "recent"}
    <RecentScopesPanel
      workbenchMode={workbenchMode}
      config={config}
      history={history}
      readablePaths={readablePaths}
      openDocuments={openDocuments}
      openDocumentsLoading={openDocumentsLoading}
      highlightPatterns={highlightPatterns}
      documentHistory={documentHistory}
      applicationScopeGroups={applicationScopeGroups}
      documentTreeOpen={documentTreeOpen}
      applicationTreeOpen={applicationTreeOpen}
      onDocumentTreeOpenChange={(open) => documentTreeOpen = open}
      onApplicationTreeOpenChange={(open) => applicationTreeOpen = open}
      onLoadOpenDocuments={loadOpenDocuments}
      onUpdateDocumentPathHighlights={updateDocumentPathHighlights}
      onReviewOpenDocument={reviewOpenDocument}
      onOpenHistoryScope={openHistoryScope}
      onTogglePinned={togglePinned}
      onRemoveHistory={removeHistory}
    />
  {:else if activeTab === "browser"}
    <BrowserPanel
      readablePaths={readablePaths}
      diagnosticRows={diagnosticRows}
      browserLoading={browserLoading}
      browserQuery={browserQuery}
      browserPriority={browserPriority}
      browserRenderer={browserRenderer}
      browserDueOnly={browserDueOnly}
      visibleDiagnostics={visibleDiagnostics}
      onBrowserQueryChange={(value) => browserQuery = value}
      onBrowserPriorityChange={(value) => browserPriority = value}
      onBrowserRendererChange={(value) => browserRenderer = value}
      onBrowserDueOnlyChange={(value) => browserDueOnly = value}
      onLoadDiagnostics={loadDiagnostics}
      onLocateCard={onLocateCard}
      onUnregisterCard={onUnregisterCard}
      onSetPriority={setPriority}
    />
  {:else if activeTab === "revlog"}
    <ReviewLogPanel
      reviewLogArchive={reviewLogArchive}
      reviewLogLoading={reviewLogLoading}
      reviewLogContextLoading={reviewLogContextLoading}
      reviewLogContextError={reviewLogContextError}
      selectedReviewLogEntries={selectedReviewLogEntries}
      reviewLogDocuments={reviewLogDocuments}
      filteredReviewLogDocuments={filteredReviewLogDocuments}
      reviewLogNotebooks={reviewLogNotebooks}
      reviewLogFrom={reviewLogFrom}
      reviewLogTo={reviewLogTo}
      reviewLogNotebook={reviewLogNotebook}
      reviewLogDocument={reviewLogDocument}
      reviewLogDocumentQuery={reviewLogDocumentQuery}
      reviewLogIncludeSubdocuments={reviewLogIncludeSubdocuments}
      reviewLogState={reviewLogState}
      onScanReviewLogs={scanReviewLogs}
      onExportMonthlyReviewLogs={exportMonthlyReviewLogs}
      onExportMergedReviewLog={exportMergedReviewLog}
      onReviewLogFromChange={(value) => reviewLogFrom = value}
      onReviewLogToChange={(value) => reviewLogTo = value}
      onReviewLogNotebookChange={(value) => reviewLogNotebook = value}
      onReviewLogDocumentQueryChange={(value) => reviewLogDocumentQuery = value}
      onReviewLogDocumentQueryEnter={applyReviewLogDocumentQuery}
      onOpenOfficialDocumentPicker={openOfficialDocumentPicker}
      onClearReviewLogDocument={() => { reviewLogDocument = ""; reviewLogDocumentQuery = ""; }}
      onReviewLogDocumentSelect={(id, label) => { reviewLogDocument = id; reviewLogDocumentQuery = label; }}
      onReviewLogIncludeSubdocumentsChange={(value) => reviewLogIncludeSubdocuments = value}
      onReviewLogStateChange={(value) => reviewLogState = value}
      onResetReviewLogFilters={() => { reviewLogFrom = ""; reviewLogTo = ""; reviewLogNotebook = ""; reviewLogDocument = ""; reviewLogDocumentQuery = ""; reviewLogIncludeSubdocuments = true; reviewLogState = ""; }}
    />
    <FsrsOptimizerPanel
      config={config}
      selectedReviewLogEntries={selectedReviewLogEntries}
      optimization={optimization}
      optimizerLoading={optimizerLoading}
      optimizerApplying={optimizerApplying}
      optimizerApplied={optimizerApplied}
      currentFsrsWeights={currentFsrsWeights}
      fsrsHistory={fsrsHistory}
      fsrsHistoryLoading={fsrsHistoryLoading}
      fsrsUndoingId={fsrsUndoingId}
      onOptimizeReviewLogs={optimizeReviewLogs}
      onApplyOptimization={applyOptimization}
      onLoadFsrsHistory={loadFsrsHistory}
      onUndoFsrsHistory={undoFsrsHistory}
      onSaveGlobalOnChange={saveGlobalOnChange}
    />
  {:else if activeTab === "global"}
    <GlobalSettingsPanel
      config={config}
      categoryConfig={categoryConfig}
      saving={saving}
      toolbarActionRows={toolbarActionRows}
      onSaveGlobalOnChange={saveGlobalOnChange}
      onUpdateGlobal={updateGlobal}
      onSaveCategoryConfig={saveCategoryConfig}
      onMoveCategory={moveCategory}
      onAddFlashcardCategoryRule={addFlashcardCategoryRule}
      onSetBooleanSetting={setBooleanSetting}
      onSetToolbarActionEnabled={setToolbarActionEnabled}
      onMoveToolbarAction={moveToolbarAction}
      onResetToolbarActions={resetToolbarActions}
      onUpdateToolbarStyle={updateToolbarStyle}
      onMoveReviewStat={moveReviewStat}
    />
  {:else}
    <GroupsPanel
      config={config}
      workbenchMode={workbenchMode}
      activeCategoryId={activeCategoryId}
      editingCategoryId={editingCategoryId}
      editingCategoryName={editingCategoryName}
      visibleGroups={visibleGroups}
      onActiveCategoryIdChange={(id) => activeCategoryId = id}
      onEditingCategoryNameChange={(name) => editingCategoryName = name}
      onAddCategory={addCategory}
      onAddGroup={addGroup}
      onCommitCategoryRename={commitCategoryRename}
      onCancelCategoryRename={cancelCategoryRename}
      onStartCategoryRename={startCategoryRename}
      onDeleteCategory={deleteCategory}
      onMoveGroup={moveGroup}
      onOpenGroup={openGroup}
      onSaveGroup={saveGroup}
      onDeleteGroup={deleteGroup}
      onViewResults={onViewResults}
      onOpenRaw={onOpenRaw}
      onOpenFiltered={onOpenFiltered}
      onBatchPriority={onBatchPriority}
    />
  {/if}
  {#if message}<p class="message" role="status">{message}</p>{/if}
</div>

<style>
  :global(.flashcard-settings *) { box-sizing: border-box; }
  .flashcard-settings {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    height: 100%;
    padding: 14px 16px 24px;
    overflow: auto;
    color: var(--foreground, var(--b3-theme-on-background));
    background: var(--background, var(--b3-theme-background));
  }
  .flashcard-settings > * { flex: 0 0 auto; min-width: 0; }
  .flashcard-settings { scrollbar-width: thin; scrollbar-color: var(--b3-scroll-color, var(--border)) transparent; }
  .flashcard-settings::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
  .flashcard-settings::-webkit-scrollbar-track { background: transparent; }
  .flashcard-settings::-webkit-scrollbar-thumb { background: var(--b3-scroll-color, var(--border)); border-radius: 6px; }
  .flashcard-settings :global(.flashcard-workbench-tabs) {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    width: 100%;
    height: 36px;
    padding: 3px;
    border: 1px solid var(--border, var(--b3-border-color));
    border-radius: 8px;
    background: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 7%, var(--background, var(--b3-theme-background)));
  }
  .flashcard-settings :global(.flashcard-workbench-tabs [data-slot="tabs-trigger"]) {
    min-width: 0;
    font-size: 12px;
    color: color-mix(in srgb, var(--foreground, var(--b3-theme-on-background)) 72%, transparent) !important;
    background: transparent !important;
  }
  .flashcard-settings :global(.flashcard-workbench-tabs [data-slot="tabs-trigger"][data-state="active"]) {
    color: var(--primary, var(--b3-theme-primary)) !important;
    background: var(--background, var(--b3-theme-background)) !important;
    border-color: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 35%, transparent);
    box-shadow: 0 1px 3px color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 14%, transparent);
  }
  .flashcard-settings :global(.flashcard-workbench-tabs [data-slot="tabs-trigger"] svg) { width: 15px; height: 15px; }
  .flashcard-settings :global(.flashcard-workbench-tabs [data-slot="tabs-trigger"] span) { overflow: hidden; text-overflow: ellipsis; }
  .message { position: sticky; bottom: 0; align-self: flex-start; margin: 0; padding: 5px 8px; color: var(--primary, var(--b3-theme-primary)); background: var(--background, var(--b3-theme-background)); border: 1px solid var(--border, var(--b3-border-color)); border-radius: 6px; font-size: 12px; }

  @container (max-width: 620px) {
    .flashcard-settings { gap: 10px; padding: 10px 10px 20px; }
    .flashcard-settings :global(.flashcard-workbench-tabs) { height: 34px; }
    .flashcard-settings :global(.flashcard-workbench-tabs [data-slot="tabs-trigger"] span) { display: none; }
    .flashcard-settings :global(.flashcard-workbench-tabs [data-slot="tabs-trigger"]) { padding-inline: 0; }
  }
</style>
