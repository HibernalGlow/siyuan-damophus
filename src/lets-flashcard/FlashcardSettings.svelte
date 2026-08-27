<script lang="ts">
  import { onMount } from "svelte";
  import { type FlashcardDiagnosticRow, type FlashcardGroup, type FlashcardReviewHistoryItem, type FlashcardReviewScope, type FlashcardReviewStatKey, type FlashcardSettings } from "@/flashcard/types";
  import type { OpenFlashcardDocument } from "@/flashcard/open-documents";
  import type { RiffCardRecord } from "@/flashcard/siyuan-adapter";
  import type { FlashcardRuntime } from "@/flashcard/runtime";
  import {
    Archive, ArrowDown, ArrowUp, Boxes, BrainCircuit, CalendarClock, Check, CheckCircle2, Crosshair, Database, Download,
    Eye, FileArchive, FileSpreadsheet, FileText, Files, Filter, Focus, Gauge, Heading, Highlighter, History,
    Layers3, LayoutDashboard, ListTree, LocateFixed, Maximize2, MessageSquareText, PanelTop, Pencil, Percent, Pin,
    ExternalLink, PinOff, Play, Plus, Quote, RefreshCw, Repeat2, RotateCcw, Save, Search,
    Settings2, SkipForward, SlidersHorizontal, Tags, Timer, Trash2, Undo2, Unlink, Network, Info,
    Upload, X, XCircle,
  } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Textarea } from "@/components/ui/textarea";
  import { Switch } from "@/components/ui/switch";
  import * as Tabs from "@/components/ui/tabs";
  import * as Select from "@/components/ui/select";
  import * as ToggleGroup from "@/components/ui/toggle-group";
  import * as TreeView from "@/components/ui/tree-view";
  import * as Tooltip from "@/components/ui/tooltip";
  import { Badge } from "@/components/ui/badge";
  import {
    createSiyuanReviewLogReader,
    downloadReviewLog,
    loadReviewLogArchive,
    monthlyReviewLogZip,
    filterReviewLogEntries,
    groupReviewLogEntriesByMonth,
    reviewLogToCsv,
    type ReviewLogCardContext,
    type ReviewLogArchive,
    type ReviewLogSelection,
  } from "@/flashcard/review-log-export";
  import type { FsrsOptimizationResult } from "@/flashcard/fsrs-optimizer-protocol";
  import type { FsrsWeightPreview } from "@/flashcard/fsrs-settings-adapter";
  import type { FsrsWeightHistoryEntry } from "@/flashcard/fsrs-weight-history";

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

  let config: FlashcardSettings = runtime.getSettings();
  let reviewToolbarActionOrderText = config.reviewToolbarActionOrder.join("\\n");
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
  const requestedPathIds = new Set<string>();
  const REVIEW_STAT_LABELS: Record<FlashcardReviewStatKey, string> = {
    reviews: "复习次数",
    lastReview: "距上次复习",
    lapses: "遗忘次数",
    lapseRate: "遗忘率",
    interval: "复习间隔",
  };
  const RENDERER_OPTIONS = [
    ["mark", "隐藏高亮 / 挖空", Highlighter], ["list", "隐藏列表答案", ListTree], ["blockquote", "隐藏引述块答案", Quote],
    ["callout", "隐藏提示块内容", MessageSquareText], ["heading", "隐藏标题后续内容", Heading], ["superBlock", "隐藏超级块内容", Boxes], ["tag", "隐藏标签", Tags], ["topicRelations", "隐藏考点关系", Network],
  ] as const;
  const TOOLBAR_OPTIONS = [
    ["reviewToolbarLocate", "定位原块", Crosshair], ["reviewToolbarUnregister", "取消登记", Unlink], ["reviewToolbarPriority", "P1-P4", Gauge],
    ["reviewToolbarWorkbench", "打开工作台", LayoutDashboard], ["reviewToolbarRenderer", "渲染开关", Eye], ["reviewToolbarSkipBetween", "跳过置于 PQ 与显示答案之间", SkipForward],
    ["reviewToolbarShowExitFocus", "显示退出聚焦", Focus], ["reviewToolbarShowBrand", "显示闪卡标题", PanelTop],
    ["reviewToolbarShowFilter", "显示原生筛选", Filter], ["reviewToolbarShowFullscreen", "显示原生全屏", Maximize2],
  ] as const;
  const REVIEW_STAT_ICONS = {
    reviews: Repeat2,
    lastReview: CalendarClock,
    lapses: RotateCcw,
    lapseRate: Percent,
    interval: History,
  };
  const FSRS_PARAMETER_DESCRIPTIONS = [
    ["w0", "Again 初始稳定性", "第一次按 Again 后的初始记忆稳定性。数值越大，系统给出的起始间隔通常越长。", "决定失败评级（Again）创建或重置卡片时的起始稳定性，是四个评级初始稳定性参数之一。"],
    ["w1", "Hard 初始稳定性", "第一次按 Hard 后的初始稳定性。", "决定困难评级（Hard）首次建立记忆时的起始稳定性，影响之后的首个复习间隔。"],
    ["w2", "Good 初始稳定性", "第一次按 Good 后的初始稳定性。", "决定正常记住（Good）时的初始稳定性，通常是最常用的新卡起点。"],
    ["w3", "Easy 初始稳定性", "第一次按 Easy 后的初始稳定性。", "决定轻松记住（Easy）时的初始稳定性，影响新卡首次被安排的间隔。"],
    ["w4", "初始难度基线", "新卡难度的基础水平。", "为首次评分计算难度提供基线；它与 w5 一起把 Again、Hard、Good、Easy 映射到不同初始难度。"],
    ["w5", "初始难度评级敏感度", "初始难度随评分变化的幅度。", "控制不同首次评分对初始难度的影响强弱；绝对值越大，评级之间的难度差异通常越明显。"],
    ["w6", "难度变化系数", "后续评分改变难度的力度。", "控制每次复习评级对当前难度的增减幅度，影响卡片在连续答对或答错后的难度漂移。"],
    ["w7", "难度回归强度", "让难度回到个人基准的力度。", "控制更新后的难度向 Easy 所对应的个人基准难度回归的速度，避免难度长期漂移到极端。"],
    ["w8", "成功稳定性增长基线", "答对后稳定性增长的基础倍率。", "控制成功复习时稳定性增长的总体幅度，是成功分支计算新稳定性的主要基线参数。"],
    ["w9", "成功增长稳定性敏感度", "当前稳定性对增长幅度的影响。", "控制已有稳定性对下一次增长的抑制或放大；用于让短稳定性和长稳定性卡片呈现不同增长曲线。"],
    ["w10", "成功增长可提取性敏感度", "当前可回忆程度对增长幅度的影响。", "根据复习时的可提取性（retrievability）调整成功后的增长；越接近遗忘边缘时，增长通常越有价值。"],
    ["w11", "遗忘后稳定性基线", "答错后重新建立稳定性的基础倍率。", "控制 Again 后重新学习阶段的稳定性起点，决定遗忘卡片恢复记忆的速度。"],
    ["w12", "遗忘难度敏感度", "卡片难度对遗忘后稳定性的影响。", "控制难度越高时遗忘后可恢复稳定性的衰减程度。"],
    ["w13", "遗忘前稳定性敏感度", "原有稳定性对遗忘后恢复的影响。", "控制遗忘前的稳定性如何参与恢复计算，影响熟卡偶尔遗忘后的回落幅度。"],
    ["w14", "遗忘可提取性敏感度", "遗忘时的可回忆程度对恢复的影响。", "把复习发生时的可提取性纳入遗忘分支，区分刚接近遗忘和已经严重遗忘的情况。"],
    ["w15", "Hard 成功惩罚", "答 Hard 时相对普通成功的稳定性折减。", "仅作用于成功分支中的 Hard 评级，用来限制困难回忆带来的稳定性增长。"],
    ["w16", "Easy 成功奖励", "答 Easy 时相对普通成功的稳定性加成。", "仅作用于成功分支中的 Easy 评级，用来增加轻松回忆时的稳定性增长。"],
    ["w17", "短期稳定性增长系数", "同日重复学习时的短期稳定性变化。", "控制同一天再次学习或重学时的稳定性增长，同时参与遗忘后的短期稳定性下限约束。"],
    ["w18", "短期评级偏移", "短期学习阶段不同评级的偏移量。", "调整 Again、Hard、Good、Easy 在短期学习分支中的相对增长，并参与遗忘后稳定性下限计算。"],
  ] as const;

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

  function displayScopeName(scope: FlashcardReviewScope, paths: Record<string, string>): string {
    const blockId = scopeBlockId(scope);
    return blockId ? paths[blockId] ?? "当前文档" : scope.targetName;
  }

  function displayBlockPath(blockId: string, paths: Record<string, string>): string {
    return paths[blockId] ?? "当前文档";
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

  function formatLastUsed(timestamp: number, now = Date.now()): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return "时间未知";
    const elapsedMinutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
    if (elapsedMinutes < 1) return "刚刚";
    if (elapsedMinutes < 60) return `${elapsedMinutes} 分钟前`;
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) return `${elapsedHours} 小时前`;
    const date = new Date(timestamp);
    const today = new Date(now);
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const time = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
    if (date >= yesterday && date < new Date(today.getFullYear(), today.getMonth(), today.getDate())) return `昨天 ${time}`;
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }

  function fullLastUsed(timestamp: number): string {
    return Number.isFinite(timestamp) && timestamp > 0
      ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(timestamp))
      : "时间未知";
  }

  function formatReviewLogDate(timestamp: number | undefined): string {
    if (!timestamp) return "暂无记录";
    return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
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

  async function openOfficialDocumentPicker(): Promise<void> {
    const host = globalThis as unknown as { siyuan?: Record<string, unknown> };
    const siyuan = host.siyuan;
    const candidates = [
      siyuan?.openDocumentPicker,
      siyuan?.openDocPicker,
      siyuan?.openDocumentSelector,
      (siyuan?.app as Record<string, unknown> | undefined)?.openDocumentPicker,
      (siyuan?.layout as Record<string, unknown> | undefined)?.openDocumentPicker,
    ].filter((candidate): candidate is (...args: unknown[]) => unknown => typeof candidate === "function");
    const picker = candidates[0];
    if (!picker) {
      message = "当前思源未公开文档选择器，已提供搜索、文档 ID 和路径输入作为回退";
      return;
    }
    let selected = false;
    const onSelect = (value: unknown) => {
      if (selected || value === undefined || value === null) return;
      selected = true;
      if (typeof value === "string" || typeof value === "object") applyReviewLogDocumentValue(value as DocumentPickerValue);
    };
    try {
      const result = picker.call(siyuan, { multiple: false, onSelect, onConfirm: onSelect });
      const resolved = result && typeof (result as Promise<unknown>).then === "function" ? await result : result;
      if (resolved !== undefined && resolved !== null) onSelect(resolved);
    } catch (error) {
      message = `调用思源文档选择器失败，已保留搜索回退：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function loadReviewLogContexts(entries: readonly ReviewLogArchive["entries"][number][]): Promise<void> {
    reviewLogContextLoading = true;
    reviewLogContextError = "";
    try {
      const cardIds = [...new Set(entries.map((entry) => entry.cardId).filter(Boolean))];
      const directRows = await runtime.adapter.loadBlocks(cardIds);
      const blockByCardId = new Map(directRows.map((row) => [row.id, row]));
      const unresolved = cardIds.filter((cardId) => !blockByCardId.has(cardId));
      if (unresolved.length > 0) {
        try {
          const registered = await runtime.adapter.getAllCardsByDeckId(runtime.getSettings().deckId);
          const cardMap = new Map(registered.map((card) => [card.cardID, card.blockID]));
          const mappedBlockIds = unresolved.map((cardId) => cardMap.get(cardId)).filter((id): id is string => Boolean(id));
          const mappedRows = await runtime.adapter.loadBlocks(mappedBlockIds);
          for (const row of mappedRows) {
            const cardId = unresolved.find((candidate) => cardMap.get(candidate) === row.id);
            if (cardId) blockByCardId.set(cardId, row);
          }
        } catch (error) {
          reviewLogContextError = `部分旧卡无法反查文档范围：${error instanceof Error ? error.message : String(error)}`;
        }
      }
      const roots = [...new Set([...blockByCardId.values()].map((row) => row.root_id || row.id).filter(Boolean))];
      const rootRows = await runtime.adapter.loadBlocks(roots);
      const rootById = new Map(rootRows.map((row) => [row.id, row]));
      const notebooks = new Map<string, string>((window.siyuan?.notebooks ?? []).map((notebook) => [notebook.id, String(notebook.name ?? notebook.id)]));
      reviewLogContexts = cardIds.map((cardId) => {
        const row = blockByCardId.get(cardId);
        const documentId = row?.root_id || (row?.type === "d" ? row.id : undefined);
        const root = documentId ? rootById.get(documentId) : undefined;
        return {
          cardId,
          blockId: row?.id,
          documentId,
          documentPath: root?.hpath || undefined,
          notebookId: row?.box || root?.box,
          notebookName: (row?.box || root?.box) ? notebooks.get(row?.box || root?.box!) : undefined,
        };
      });
    } catch (error) {
      reviewLogContexts = [];
      reviewLogContextError = `读取卡片范围失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      reviewLogContextLoading = false;
    }
  }

  async function scanReviewLogs(): Promise<ReviewLogArchive | undefined> {
    reviewLogLoading = true;
    try {
      reviewLogArchive = await loadReviewLogArchive(createSiyuanReviewLogReader());
      await loadReviewLogContexts(reviewLogArchive.entries);
      message = reviewLogArchive.entries.length
        ? `已读取 ${reviewLogArchive.entries.length} 条复习记录`
        : "没有找到可导出的复习记录";
      return reviewLogArchive;
    } catch (error) {
      message = `读取复习记录失败：${error instanceof Error ? error.message : String(error)}`;
      return undefined;
    } finally {
      reviewLogLoading = false;
    }
  }

  async function exportMergedReviewLog(): Promise<void> {
    const archive = reviewLogArchive ?? await scanReviewLogs();
    if (!archive?.entries.length) return;
    try {
      downloadReviewLog(reviewLogToCsv(selectedReviewLogEntries), "revlog.csv", "text/csv;charset=utf-8");
      message = `已导出合并记录，共 ${selectedReviewLogEntries.length} 条`;
    } catch (error) {
      message = `导出合并记录失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function exportMonthlyReviewLogs(): Promise<void> {
    const archive = reviewLogArchive ?? await scanReviewLogs();
    if (!archive?.entries.length) return;
    reviewLogLoading = true;
    try {
      const selected = selectedReviewLogEntries;
      const bytes = await monthlyReviewLogZip({
        ...archive,
        entries: selected,
        entriesByMonth: groupReviewLogEntriesByMonth(selected),
        files: [...groupReviewLogEntriesByMonth(selected).keys()].map((month) => ({ name: `${month}.msgpack`, month })),
      });
      downloadReviewLog(bytes as BlobPart, "siyuan-revlog-by-month.zip", "application/zip");
      message = `已导出 ${groupReviewLogEntriesByMonth(selected).size} 个月份和合并记录`;
    } catch (error) {
      message = `按月导出失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      reviewLogLoading = false;
    }
  }

  async function optimizeReviewLogs(): Promise<void> {
    const archive = reviewLogArchive ?? await scanReviewLogs();
    if (!archive?.entries.length || !selectedReviewLogEntries.length) {
      message = "当前筛选没有可用于训练的记录";
      return;
    }
    optimizerLoading = true;
    optimizerApplied = false;
    optimization = undefined;
    message = config.fsrsOptimizerMode === "internal" ? "正在思源插件内部训练 FSRS 参数" : "已打开系统浏览器，等待 FSRS 训练完成";
    try {
      optimization = await onOptimizeReviewLog(selectedReviewLogEntries);
      message = `训练完成，用时 ${(optimization.result.durationMs / 1000).toFixed(1)} 秒；请预览后确认应用`;
    } catch (error) {
      message = `FSRS 优化失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      optimizerLoading = false;
    }
  }

  async function applyOptimization(): Promise<void> {
    if (!optimization) return;
    optimizerApplying = true;
    try {
      optimizerApplied = await onApplyFsrsWeights(optimization.result.weights);
      if (optimizerApplied) {
        message = "已写入并回读验证 FSRS 参数";
        await loadFsrsHistory();
        currentFsrsWeights = onGetFsrsWeights();
      }
    } catch (error) {
      message = `应用 FSRS 参数失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      optimizerApplying = false;
    }
  }

  async function loadFsrsHistory(): Promise<void> {
    fsrsHistoryLoading = true;
    try {
      fsrsHistory = await onLoadFsrsHistory();
    } catch (error) {
      message = `读取 FSRS 参数历史失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      fsrsHistoryLoading = false;
    }
  }

  async function undoFsrsHistory(entry: FsrsWeightHistoryEntry): Promise<void> {
    if (fsrsUndoingId) return;
    fsrsUndoingId = entry.id;
    try {
      if (await onUndoFsrsWeights(entry)) {
        message = "已撤销这次 FSRS 参数修改，并完成回读验证";
        await loadFsrsHistory();
        currentFsrsWeights = onGetFsrsWeights();
      }
    } catch (error) {
      message = `撤销 FSRS 参数失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      fsrsUndoingId = "";
    }
  }

  function formatFsrsHistoryDate(timestamp: number): string {
    return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp));
  }

  onMount(() => {
    currentFsrsWeights = onGetFsrsWeights();
    void loadFsrsHistory();
    void loadOpenDocuments();
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

  function setBooleanSetting(key: typeof TOOLBAR_OPTIONS[number][0], value: boolean): void {
    (config as unknown as Record<string, unknown>)[key] = value;
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
  <header class="settings-header">
    <div class="settings-title"><Layers3 aria-hidden="true" /><strong>专项闪卡</strong></div>
    <div class="workbench-mode-toggle" role="group" aria-label="工作台模式">
      <Button variant={workbenchMode === "make" ? "default" : "outline"} size="sm" aria-pressed={workbenchMode === "make"} onclick={() => workbenchMode = "make"} title="制卡模式"><Pencil /><span>制卡</span></Button>
      <Button variant={workbenchMode === "review" ? "default" : "outline"} size="sm" aria-pressed={workbenchMode === "review"} onclick={() => workbenchMode = "review"} title="复习模式"><Play /><span>复习</span></Button>
    </div>
    <label class="workbench-auto-review"><span>登记后自动复习</span><Switch size="sm" checked={config.autoReviewAfterRegistration} onCheckedChange={(value) => { config.autoReviewAfterRegistration = value; saveGlobalOnChange(); }} aria-label="登记后自动复习" /></label>
    <label class="workbench-timer"><span>复习计时</span><Switch size="sm" checked={config.reviewTimerEnabled} onCheckedChange={(value) => { config.reviewTimerEnabled = value; saveGlobalOnChange(); }} aria-label="复习计时" /></label>
    <div class="flashcard-header-actions">
      <Button size="sm" onclick={onReviewAll} title="打开全部到期卡" aria-label="打开全部到期卡"><Play /><span>全部到期</span></Button>
      <Button variant="outline" size="sm" onclick={clearCache} title="清除 SQL 缓存" aria-label="清除 SQL 缓存"><RefreshCw /><span>刷新缓存</span></Button>
      <Button variant="outline" size="sm" onclick={onImportSfp} title="导入 Specialized Flashcard Plugin 的分组设置" aria-label="导入 SFP 设置"><Upload /><span>导入 SFP</span></Button>
    </div>
  </header>

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
    <section class="open-documents-panel" data-testid="open-documents-panel">
      <div class="section-heading open-documents-heading">
        <div><h3>当前打开文档</h3><p>{workbenchMode === "make" ? "选择文档和分组检测闪卡并开始制卡" : "直接选择文档和分组开始专项复习"}</p></div>
        <Button variant="outline" size="sm" disabled={openDocumentsLoading} onclick={loadOpenDocuments} title="刷新当前打开文档" aria-label="刷新当前打开文档"><RefreshCw class={openDocumentsLoading ? "loading-icon" : ""} /><span>刷新</span></Button>
      </div>
      {#if openDocuments.length}
        <div class="open-documents-list">
          {#each openDocuments as document (document.documentId)}
            <article class:open-document-active={document.active} class="open-document-row">
              <div class="open-document-copy">
                <div class="open-document-title"><FileText /><strong>{document.title}</strong>{#if document.active}<Badge variant="secondary">当前</Badge>{/if}</div>
                <span class="open-document-path" title={document.documentId}>{document.path}</span>
              </div>
              <div class="open-document-actions">
                <Button variant="outline" size="sm" onclick={() => reviewOpenDocument(document)} title={workbenchMode === "make" ? `检测 ${document.title} 的全部闪卡` : `复习 ${document.title} 的全部到期卡`} aria-label={workbenchMode === "make" ? `检测 ${document.title} 的全部闪卡` : `复习 ${document.title} 的全部到期卡`}><Play /><span>{workbenchMode === "make" ? "检测" : "全部"}</span></Button>
                {#each config.groups.filter((group) => group.enabled) as group (group.id)}
                  <Button variant="ghost" size="sm" onclick={() => reviewOpenDocument(document, group)} title={workbenchMode === "make" ? `检测 ${document.title} 的 ${group.name}` : `按 ${group.name} 复习 ${document.title}`} aria-label={workbenchMode === "make" ? `检测 ${document.title} 的 ${group.name}` : `按 ${group.name} 复习 ${document.title}`}><Layers3 /><span>{workbenchMode === "make" ? `检测 · ${group.name}` : group.name}</span></Button>
                {/each}
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <p class="empty">当前没有可识别的打开文档。</p>
      {/if}
    </section>
    <section class="recent-history-panel" data-testid="recent-history-panel">
      <div class="section-heading recent-history-heading">
        <div><h3>最近使用与置顶范围</h3><p>按置顶、使用次数和最近使用排序</p></div>
      </div>
      {#if history.length}
        <TreeView.Root class="scope-tree" aria-label="最近复习范围">
        {#if documentHistory.length}
          <TreeView.Folder name={`文档范围 (${documentHistory.length})`} bind:open={documentTreeOpen} class="tree-branch">
            {#each documentHistory as scope (scope.id)}
              <article class="tree-leaf-row">
                <Button variant="ghost" size="icon-sm" title={scope.pinned ? "取消置顶" : "置顶"} aria-label={scope.pinned ? "取消置顶" : "置顶"} onclick={() => togglePinned(scope)}>{#if scope.pinned}<PinOff />{:else}<Pin />{/if}</Button>
                <TreeView.File class="tree-leaf" name={displayScopeName(scope, readablePaths)} title={`${displayScopeName(scope, readablePaths)}\n${fullLastUsed(scope.lastUsedAt)}`} onclick={() => openHistoryScope(scope)} />
                <Badge variant="secondary" title={fullLastUsed(scope.lastUsedAt)}>{formatLastUsed(scope.lastUsedAt)} · {scope.useCount} 次</Badge>
                <Button variant="ghost" size="icon-sm" title="移除最近记录" aria-label="移除最近记录" onclick={() => removeHistory(scope.id)}><Trash2 /></Button>
              </article>
            {/each}
          </TreeView.Folder>
        {/if}
        {#if applicationScopeGroups.length}
          <TreeView.Folder name={`应用分组 (${applicationScopeGroups.length})`} bind:open={applicationTreeOpen} class="tree-branch">
            {#each applicationScopeGroups as group (group.name)}
              <TreeView.Folder name={`${group.name} (${group.scopes.length})`} class="tree-subbranch">
                {#each group.scopes as scope (scope.id)}
                  <article class="tree-leaf-row">
                    <Button variant="ghost" size="icon-sm" title={scope.pinned ? "取消置顶" : "置顶"} aria-label={scope.pinned ? "取消置顶" : "置顶"} onclick={() => togglePinned(scope)}>{#if scope.pinned}<PinOff />{:else}<Pin />{/if}</Button>
                    <TreeView.File class="tree-leaf" name={displayScopeName(scope, readablePaths)} title={`${displayScopeName(scope, readablePaths)}\n${fullLastUsed(scope.lastUsedAt)}`} onclick={() => openHistoryScope(scope)} />
                    <Badge variant="secondary" title={fullLastUsed(scope.lastUsedAt)}>{formatLastUsed(scope.lastUsedAt)} · {scope.useCount} 次</Badge>
                    <Button variant="ghost" size="icon-sm" title="移除最近记录" aria-label="移除最近记录" onclick={() => removeHistory(scope.id)}><Trash2 /></Button>
                  </article>
                {/each}
              </TreeView.Folder>
            {/each}
          </TreeView.Folder>
        {/if}
        </TreeView.Root>
      {:else}<p class="empty">从插件菜单或 SQL 分组开始一次复习后，这里会显示最近范围。</p>{/if}
    </section>
  {:else if activeTab === "browser"}
    <section class="browser-toolbar">
      <Input placeholder="搜索内容、路径或分组" bind:value={browserQuery} />
      <Select.Root type="single" value={browserPriority} onValueChange={(value) => browserPriority = value}>
        <Select.Trigger aria-label="优先级筛选">{{ all: "全部优先级", none: "无标签", conflict: "冲突" }[browserPriority] ?? browserPriority}</Select.Trigger>
        <Select.Content>{#each [["all", "全部优先级"], ["P1", "P1"], ["P2", "P2"], ["P3", "P3"], ["P4", "P4"], ["none", "无标签"], ["conflict", "冲突"]] as option}<Select.Item value={option[0]} label={option[1]} />{/each}</Select.Content>
      </Select.Root>
      <Select.Root type="single" value={browserRenderer} onValueChange={(value) => browserRenderer = value}>
        <Select.Trigger aria-label="Renderer 筛选">{browserRenderer === "all" ? "全部形式" : browserRenderer === "unknown" ? "未知" : browserRenderer}</Select.Trigger>
        <Select.Content>{#each ["all", "mark", "list", "heading", "superBlock", "blockquote", "callout", "unknown"] as renderer}<Select.Item value={renderer} label={renderer === "all" ? "全部形式" : renderer === "unknown" ? "未知" : renderer} />{/each}</Select.Content>
      </Select.Root>
      <label class="inline-switch"><span>仅到期</span><Switch size="sm" checked={browserDueOnly} onCheckedChange={(value) => browserDueOnly = value} aria-label="仅显示到期卡" /></label>
      <Button variant="outline" size="sm" disabled={browserLoading} onclick={loadDiagnostics}><RefreshCw />刷新</Button>
    </section>
    <p class="browser-summary">显示 {visibleDiagnostics.length} / {diagnosticRows.length} 张；单次最多渲染 300 张。</p>
    <div class="diagnostic-list">
      {#each visibleDiagnostics as row (row.card.cardID)}
        <article class="diagnostic-row">
          <div class="diagnostic-main">
            <strong>{row.priorityConflict ? "优先级冲突" : row.priority ?? "无优先级"} · {row.renderer} · {row.due ? "已到期" : "未到期"}</strong>
            <span>{row.content || displayBlockPath(row.blockId, readablePaths)}</span>
            <small title={row.blockId}>{displayBlockPath(row.blockId, readablePaths)}{row.groupNames.length ? ` · ${row.groupNames.join(" / ")}` : " · 未命中启用分组"}</small>
          </div>
          <div class="diagnostic-actions">
            <Button variant="ghost" size="icon-sm" title="定位原块" aria-label="定位原块" onclick={() => onLocateCard(row.card)}><LocateFixed /></Button>
            <Select.Root type="single" value={row.priority ?? ""} onValueChange={(value) => setPriority(row, ({ P1: 100, P2: 75, P3: 50, P4: 25 } as Record<string, number>)[value])}>
              <Select.Trigger size="sm" aria-label="修改优先级">{row.priority ?? "P"}</Select.Trigger>
              <Select.Content>{#each ["P1", "P2", "P3", "P4"] as priority}<Select.Item value={priority} label={priority} />{/each}</Select.Content>
            </Select.Root>
            <Button variant="destructive" size="icon-sm" title="取消闪卡登记" aria-label="取消闪卡登记" onclick={() => onUnregisterCard(row.card)}><XCircle /></Button>
          </div>
        </article>
      {:else}<p class="empty">没有符合筛选条件的闪卡。</p>{/each}
    </div>
  {:else if activeTab === "revlog"}
    <section class="review-log-header">
      <div class="review-log-heading" data-testid="review-log-heading">
        <span class="review-log-heading-icon"><Archive /></span>
        <div><h3>复习记录</h3><p>导出 FSRS 兼容数据，原记录保持不变</p></div>
      </div>
      <div class="review-log-actions">
        <Button variant="outline" size="sm" disabled={reviewLogLoading} onclick={scanReviewLogs} title="扫描复习记录" aria-label="扫描复习记录"><RefreshCw /><span>扫描</span></Button>
        <Button variant="outline" size="sm" disabled={reviewLogLoading || !selectedReviewLogEntries.length} onclick={exportMonthlyReviewLogs} title="按当前筛选按月打包导出" aria-label="按月打包导出"><FileArchive /><span>按月 ZIP</span></Button>
        <Button size="sm" disabled={reviewLogLoading || !selectedReviewLogEntries.length} onclick={exportMergedReviewLog} title="导出当前筛选记录" aria-label="导出合并记录"><Download /><span>合并 CSV</span></Button>
      </div>
    </section>
    <section class="settings-section review-log-panel" data-testid="review-log-panel">
      <div class="section-title"><FileSpreadsheet /><div><h3>Riff 复习日志</h3><p><code>/data/storage/riff/logs</code></p></div></div>
      {#if reviewLogLoading}
        <div class="review-log-empty"><RefreshCw class="loading-icon" /><strong>正在读取复习记录</strong></div>
      {:else if reviewLogArchive}
        <div class="review-log-summary">
          <div><FileArchive /><span>月份文件</span><strong>{reviewLogArchive.files.length}</strong></div>
          <div><History /><span>有效记录</span><strong>{reviewLogArchive.entries.length}</strong></div>
          <div><CalendarClock /><span>时间范围</span><strong>{formatReviewLogDate(reviewLogArchive.firstReviewedAt)}<br />至 {formatReviewLogDate(reviewLogArchive.lastReviewedAt)}</strong></div>
        </div>
        <div class="review-log-status">
          <Badge variant={reviewLogArchive.errors.length ? "destructive" : "secondary"}>
            {reviewLogArchive.errors.length ? `跳过 ${reviewLogArchive.errors.length} 个不兼容文件` : "当前 Riff 日志格式兼容"}
          </Badge>
          {#if reviewLogArchive.duplicateCount}<Badge variant="outline">已去除 {reviewLogArchive.duplicateCount} 条重复记录</Badge>{/if}
        </div>
        {#if reviewLogArchive.errors.length}
          <div class="review-log-errors">
            {#each reviewLogArchive.errors as error}<p><strong>{error.file}</strong><span>{error.message}</span></p>{/each}
          </div>
        {/if}
        <div class="review-log-filter" data-testid="review-log-filter">
          <div class="review-log-filter-heading"><Filter /><div><strong>选择导入记录</strong><span>筛选只影响本次训练和导出，原始日志不会被修改。</span></div><Badge variant="secondary">{selectedReviewLogEntries.length} / {reviewLogArchive.entries.length}</Badge></div>
          <div class="review-log-filter-grid">
            <label>开始时间<Input type="datetime-local" bind:value={reviewLogFrom} aria-label="复习记录开始时间" /></label>
            <label>结束时间<Input type="datetime-local" bind:value={reviewLogTo} aria-label="复习记录结束时间" /></label>
            <label>笔记本
              <Select.Root type="single" value={reviewLogNotebook || "all"} onValueChange={(value) => reviewLogNotebook = value === "all" ? "" : value}>
                <Select.Trigger aria-label="复习记录笔记本">{reviewLogNotebook ? (reviewLogNotebooks.find((item) => item.id === reviewLogNotebook)?.label ?? "当前笔记本") : "全部笔记本"}</Select.Trigger>
                <Select.Content>
                  <Select.Item value="all" label="全部笔记本" />
                  {#each reviewLogNotebooks as notebook}<Select.Item value={notebook.id} label={notebook.label} />{/each}
                </Select.Content>
              </Select.Root>
            </label>
            <div class="review-log-document-field">
              <label for="review-log-document-query">文档</label>
              <div class="review-log-document-controls">
                <Input id="review-log-document-query" bind:value={reviewLogDocumentQuery} placeholder="搜索路径或输入文档 ID" aria-label="搜索或输入复习记录文档" onkeydown={(event) => event.key === "Enter" && applyReviewLogDocumentQuery()} />
                <Button variant="outline" size="sm" onclick={openOfficialDocumentPicker} title="调用思源官方文档选择器" aria-label="选择文档"><FileText /><span>选择</span></Button>
                {#if reviewLogDocument}<Button variant="ghost" size="icon-sm" onclick={() => { reviewLogDocument = ""; reviewLogDocumentQuery = ""; }} title="清除文档筛选" aria-label="清除文档筛选"><X /></Button>{/if}
              </div>
              <div class="review-log-document-results" role="listbox" aria-label="复习记录文档候选">
                {#if filteredReviewLogDocuments.length}
                  {#each filteredReviewLogDocuments as document}
                    <Button variant="ghost" size="sm" class={reviewLogDocument === document.id ? "document-result document-result-active" : "document-result"} onclick={() => { reviewLogDocument = document.id; reviewLogDocumentQuery = document.label; }} title={document.id}>
                      <FileText /><span>{document.label}</span>
                    </Button>
                  {/each}
                {:else if reviewLogDocumentQuery.trim()}<span class="review-log-document-empty">没有匹配的文档</span>
                {:else}<span class="review-log-document-empty">输入路径或 ID 搜索文档，也可点击“选择”</span>{/if}
              </div>
              <div class="review-log-document-options">
                <label class="review-log-subdocument-toggle"><Switch size="sm" checked={reviewLogIncludeSubdocuments} onCheckedChange={(value) => reviewLogIncludeSubdocuments = value} aria-label="包含子文档" /><span>包含子文档</span></label>
                <span>{reviewLogDocument ? (reviewLogDocuments.find((item) => item.id === reviewLogDocument)?.label ?? "已选择文档") : "未选择文档"}</span>
              </div>
            </div>
            <label>复习状态
              <Select.Root type="single" value={reviewLogState || "all"} onValueChange={(value) => reviewLogState = value === "all" ? "" : value}>
                <Select.Trigger aria-label="复习记录状态">{{ "0": "新卡", "1": "学习中", "2": "复习中", "3": "重新学习" }[reviewLogState] ?? "全部状态"}</Select.Trigger>
                <Select.Content>
                  <Select.Item value="all" label="全部状态" />
                  <Select.Item value="0" label="新卡" />
                  <Select.Item value="1" label="学习中" />
                  <Select.Item value="2" label="复习中" />
                  <Select.Item value="3" label="重新学习" />
                </Select.Content>
              </Select.Root>
            </label>
          </div>
          <div class="review-log-filter-footer">
            <span>{reviewLogContextLoading ? "正在读取卡片所属文档和笔记本…" : reviewLogContextError || "可按时间、文档、笔记本和复习状态组合筛选"}</span>
            <Button variant="ghost" size="sm" onclick={() => { reviewLogFrom = ""; reviewLogTo = ""; reviewLogNotebook = ""; reviewLogDocument = ""; reviewLogDocumentQuery = ""; reviewLogIncludeSubdocuments = true; reviewLogState = ""; }} disabled={!reviewLogFrom && !reviewLogTo && !reviewLogNotebook && !reviewLogDocument && !reviewLogDocumentQuery && !reviewLogState}>重置筛选</Button>
          </div>
        </div>
      {:else}
        <div class="review-log-empty"><Archive /><strong>尚未扫描</strong><span>点击扫描检查当前 SiYuan 的日志格式和可导出记录数</span></div>
      {/if}
    </section>
    <section class="settings-section optimizer-panel" data-testid="fsrs-optimizer-panel">
      <div class="section-title optimizer-title">
        <BrainCircuit />
        <div><h3>FSRS 参数优化</h3><p>fsrs-browser 2.0.4 · 19 参数 · {config.fsrsOptimizerMode === "internal" ? "插件内部单线程" : "系统浏览器多线程"}</p></div>
        <Select.Root type="single" value={config.fsrsOptimizerMode} onValueChange={(value) => { config.fsrsOptimizerMode = value === "browser" ? "browser" : "internal"; saveGlobalOnChange(); }}>
          <Select.Trigger size="sm" aria-label="FSRS 优化运行模式">{config.fsrsOptimizerMode === "internal" ? "插件内部" : "系统浏览器"}</Select.Trigger>
          <Select.Content>
            <Select.Item value="internal" label="插件内部（单线程）" />
            <Select.Item value="browser" label="系统浏览器（多线程）" />
          </Select.Content>
        </Select.Root>
        <Button
          size="sm"
          disabled={optimizerLoading || reviewLogLoading || !selectedReviewLogEntries.length}
          onclick={optimizeReviewLogs}
          title={config.fsrsOptimizerMode === "internal" ? "在思源插件内部开始本地训练" : "在系统浏览器中开始本地训练"}
          aria-label="启动 FSRS 优化器"
        >
          {#if optimizerLoading}<RefreshCw class="loading-icon" />{:else if config.fsrsOptimizerMode === "internal"}<BrainCircuit />{:else}<ExternalLink />{/if}
          <span>{optimizerLoading ? "正在训练" : config.fsrsOptimizerMode === "internal" ? "内部训练" : "打开浏览器"}</span>
        </Button>
      </div>
      {#if optimization}
        <div class="optimizer-result-summary">
          <div><CheckCircle2 /><span>训练完成</span><strong>{optimization.result.sourceRecordCount} 条 · {optimization.result.cardCount} 张</strong></div>
          <div><CalendarClock /><span>训练耗时</span><strong>{(optimization.result.durationMs / 1000).toFixed(1)} 秒</strong></div>
          <div><BrainCircuit /><span>参数协议</span><strong>FSRS-5 · 19 项</strong></div>
        </div>
        <Tooltip.Provider>
          <div class="fsrs-parameter-grid" aria-label="FSRS 19 项参数说明">
            {#each FSRS_PARAMETER_DESCRIPTIONS as parameter, index}
              {@const current = optimization.preview.current[index]}
              {@const optimized = optimization.preview.optimized[index]}
              {@const delta = optimized - current}
              {@const changed = Math.abs(delta) > 1e-7}
              <div class:changed class:increased={delta > 1e-7} class:decreased={delta < -1e-7} class="fsrs-parameter-card">
                <div class="fsrs-parameter-info">
                  <Tooltip.Root>
                    <Tooltip.Trigger class="fsrs-info-trigger" aria-label={`${parameter[0]} 详细说明`}>
                      <Info />
                    </Tooltip.Trigger>
                    <Tooltip.Content side="top">{parameter[3]}</Tooltip.Content>
                  </Tooltip.Root>
                  <div class="fsrs-parameter-copy"><strong>{parameter[0]} · {parameter[1]}</strong><span>{parameter[2]}</span></div>
                </div>
                <div class:increased={delta > 1e-7} class:decreased={delta < -1e-7} class="fsrs-parameter-values" aria-label={changed ? `从 ${Number(current.toPrecision(7))} 变为 ${Number(optimized.toPrecision(7))}` : `当前值 ${Number(current.toPrecision(7))}`}>
                  {#if changed}
                    <div class="fsrs-value-diff">
                      <del class="fsrs-value-old">{Number(current.toPrecision(7))}</del>
                      {#if delta > 1e-7}<ArrowUp class="fsrs-diff-icon" aria-hidden="true" />{:else}<ArrowDown class="fsrs-diff-icon" aria-hidden="true" />{/if}
                      <strong class="fsrs-value-new">{Number(optimized.toPrecision(7))}</strong>
                    </div>
                    <span class="fsrs-delta">{delta > 0 ? "+" : ""}{Number(delta.toPrecision(5))}</span>
                  {:else}
                    <strong class="fsrs-value-same">{Number(current.toPrecision(7))}</strong>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </Tooltip.Provider>
        <div class="optimizer-apply">
          <Badge variant={optimizerApplied ? "secondary" : "outline"}>{optimizerApplied ? "已应用并验证" : "尚未修改思源设置"}</Badge>
          <Button size="sm" disabled={optimizerApplying || optimizerApplied} onclick={applyOptimization} aria-label="应用 FSRS 参数">
            {#if optimizerApplying}<RefreshCw class="loading-icon" />{:else}<Save />{/if}
            <span>{optimizerApplying ? "正在验证" : optimizerApplied ? "已应用" : "应用参数"}</span>
          </Button>
        </div>
      {:else}
        <div class="optimizer-empty">
          <BrainCircuit />
          <div><strong>在系统浏览器中训练</strong><span>当前将使用 {selectedReviewLogEntries.length || 0} 条筛选记录；本地端口 52370 仅在训练期间开放，训练结果返回后仍需在此确认应用。</span></div>
        </div>
      {/if}
      {#if !optimization}
        <Tooltip.Provider>
          <div class="fsrs-parameter-reference" aria-label="FSRS 参数参考">
            <div class="fsrs-reference-heading"><div><strong>当前 19 项参数</strong><span>短说明直接显示，悬停信息图标查看详细作用。</span></div><Badge variant="outline">FSRS-5</Badge></div>
            <div class="fsrs-reference-grid">
              {#each FSRS_PARAMETER_DESCRIPTIONS as parameter, index}
                {@const value = currentFsrsWeights[index]}
                <div class="fsrs-reference-row">
                  <Tooltip.Root>
                    <Tooltip.Trigger class="fsrs-info-trigger" aria-label={`${parameter[0]} 详细说明`}>
                      <Info />
                    </Tooltip.Trigger>
                    <Tooltip.Content side="top">{parameter[3]}</Tooltip.Content>
                  </Tooltip.Root>
                  <div class="fsrs-reference-copy"><strong>{parameter[0]} · {parameter[1]}</strong><span>{parameter[2]}</span></div>
                  <code>{value === undefined ? "—" : Number(value.toPrecision(7))}</code>
                </div>
              {/each}
            </div>
          </div>
        </Tooltip.Provider>
      {/if}
      <section class="fsrs-history-panel" aria-label="FSRS 参数修改历史">
        <div class="fsrs-history-heading"><div><strong>参数修改历史</strong><span>每次应用或撤销都会保留上一组权重，可随时恢复。</span></div><Button variant="ghost" size="icon-sm" onclick={loadFsrsHistory} disabled={fsrsHistoryLoading} title="刷新参数历史" aria-label="刷新参数历史"><RefreshCw class={fsrsHistoryLoading ? "loading-icon" : ""} /></Button></div>
        {#if fsrsHistoryLoading}<p class="fsrs-history-empty">正在读取历史…</p>
        {:else if fsrsHistory.length}
          <div class="fsrs-history-list">
            {#each fsrsHistory as entry (entry.id)}
              <div class="fsrs-history-row">
                <div><strong>{entry.source === "undo" ? "撤销修改" : "优化器应用"}</strong><span>{formatFsrsHistoryDate(entry.createdAt)} · {entry.next.map((value, index) => Math.abs(value - entry.previous[index]) > 1e-7 ? `w${index}` : "").filter(Boolean).slice(0, 4).join("、") || "无变化"}</span></div>
                <Button variant="outline" size="sm" onclick={() => undoFsrsHistory(entry)} disabled={fsrsUndoingId !== ""} title="恢复这条记录之前的参数" aria-label="撤销这次参数修改">{#if fsrsUndoingId === entry.id}<RefreshCw class="loading-icon" />{:else}<Undo2 />{/if}<span>撤销</span></Button>
              </div>
            {/each}
          </div>
        {:else}<p class="fsrs-history-empty">还没有参数修改记录</p>{/if}
      </section>
    </section>
  {:else if activeTab === "global"}
    <div class="global-settings">
      <section class="settings-section">
        <div class="section-title"><Settings2 /><div><h3>基础与自动化</h3><p>牌组、扫描频率和新卡处理</p></div></div>
        <div class="field-grid">
          <label>牌组 ID<Input bind:value={config.deckId} onchange={saveGlobalOnChange} /></label>
          <label>首轮上限<Input type="number" min="1" max="1000" bind:value={config.maxReviewCards} onchange={saveGlobalOnChange} /></label>
          <label>向上传递深度<Input type="number" min="1" max="32" bind:value={config.maxResolveDepth} onchange={saveGlobalOnChange} /></label>
          <label>缓存刷新（分钟）<Input type="number" min="1" max="1440" bind:value={config.cacheUpdateInterval} onchange={saveGlobalOnChange} /></label>
          <label>缓存扫描（分钟）<Input type="number" min="1" max="1440" bind:value={config.scanInterval} onchange={saveGlobalOnChange} /></label>
          <label>推迟天数<Input type="number" min="1" max="30" bind:value={config.postponeDays} onchange={saveGlobalOnChange} disabled={!config.postponeEnabled} /></label>
        </div>
        <div class="setting-row review-mode-row">
          <div><strong>分组取卡模式</strong><span>用于 SQL 分组及其文档、笔记本组合范围</span></div>
          <ToggleGroup.Root
            type="single"
            variant="outline"
            class="review-mode-toggle"
            value={config.scopedReviewMode}
            onValueChange={(value) => {
              if (!value) return;
              config.scopedReviewMode = value === "native" ? "native" : "exact";
              saveGlobalOnChange();
            }}
            aria-label="分组取卡模式"
          >
            <ToggleGroup.Item value="exact" title="精确分组" aria-label="精确分组">
              <Crosshair aria-hidden="true" />
              <span>精确分组</span>
              {#if config.scopedReviewMode === "exact"}<Check class="review-mode-check" data-review-mode-check="exact" aria-hidden="true" />{/if}
            </ToggleGroup.Item>
            <ToggleGroup.Item value="native" title="原生过滤" aria-label="原生过滤">
              <Filter aria-hidden="true" />
              <span>原生过滤</span>
              {#if config.scopedReviewMode === "native"}<Check class="review-mode-check" data-review-mode-check="native" aria-hidden="true" />{/if}
            </ToggleGroup.Item>
          </ToggleGroup.Root>
        </div>
        <div class="setting-row"><div><strong>自动推迟今日新卡</strong><span>按设定天数延后今天创建的新卡</span></div><Switch checked={config.postponeEnabled} onCheckedChange={(value) => { config.postponeEnabled = value; saveGlobalOnChange(); }} aria-label="自动推迟今日新卡" /></div>
        <div class="setting-row"><div><strong>登记前额外确认</strong><span>预览界面始终显示；开启后点击制卡还会再弹出一次确认</span></div><Switch checked={config.confirmBeforeAutoRegister} onCheckedChange={(value) => { config.confirmBeforeAutoRegister = value; saveGlobalOnChange(); }} aria-label="登记前额外确认" /></div>
        <div class="section-actions"><Button size="sm" onclick={updateGlobal} disabled={saving}><Save />保存并应用</Button></div>
      </section>

      <section class="settings-section">
        <div class="section-title"><LocateFixed /><div><h3>文档入口</h3><p>控制编辑器中的快捷入口</p></div></div>
        <div class="setting-row"><div><strong>桌面端面包屑按钮</strong><span>在桌面端当前文档面包屑中提供快速复习</span></div><Switch checked={config.showDesktopBreadcrumbReviewButton} onCheckedChange={(value) => { config.showDesktopBreadcrumbReviewButton = value; saveGlobalOnChange(); }} aria-label="桌面端面包屑闪卡按钮" /></div>
        <div class="setting-row"><div><strong>移动端面包屑按钮</strong><span>在移动端当前文档面包屑中提供快速复习</span></div><Switch checked={config.showMobileBreadcrumbReviewButton} onCheckedChange={(value) => { config.showMobileBreadcrumbReviewButton = value; saveGlobalOnChange(); }} aria-label="移动端面包屑闪卡按钮" /></div>
      </section>

      <section class="settings-section">
        <div class="section-title"><Layers3 /><div><h3>卡片渲染</h3><p>按卡片 renderer 应用专属隐藏范围</p></div></div>
        <div class="setting-row master-row"><div><strong>启用卡片渲染适配</strong><span>关闭后完全沿用思源的全局闪卡设置</span></div><Switch checked={config.rendererInterceptionEnabled} onCheckedChange={(value) => { config.rendererInterceptionEnabled = value; saveGlobalOnChange(); }} aria-label="启用卡片渲染适配" /></div>
        {#if config.rendererInterceptionEnabled}
          <div class="option-grid" data-testid="renderer-options">
            {#each RENDERER_OPTIONS as option}
              <div class="option-row"><svelte:component this={option[2]} aria-hidden="true" /><span>{option[1]}</span><Switch size="sm" checked={config.rendererVisibility[option[0]]} onCheckedChange={(value) => { config.rendererVisibility[option[0]] = value; saveGlobalOnChange(); }} aria-label={option[1]} /></div>
            {/each}
          </div>
        {/if}
      </section>

      <section class="settings-section">
        <div class="section-title"><RefreshCw /><div><h3>复习顺序</h3><p>优先级队列中的随机策略</p></div></div>
        <div class="setting-row"><div><strong>随机穿插</strong><span>将约 5% 的较低优先级卡插入高优先级区段</span></div><Switch checked={config.randomInterleaveEnabled} onCheckedChange={(value) => { config.randomInterleaveEnabled = value; saveGlobalOnChange(); }} aria-label="随机穿插" /></div>
        <div class="setting-row"><div><strong>同级随机</strong><span>每轮打乱同一优先级内的卡片顺序</span></div><Switch checked={config.samePriorityShuffleEnabled} onCheckedChange={(value) => { config.samePriorityShuffleEnabled = value; saveGlobalOnChange(); }} aria-label="同级随机" /></div>
      </section>

      <section class="settings-section">
        <div class="section-title"><SlidersHorizontal /><div><h3>当前卡片信息</h3><p>选择统计项并调整显示顺序</p></div></div>
        <div class="setting-row master-row"><div><strong>显示当前卡片统计</strong><span>在原生复习界面显示复习数据</span></div><Switch checked={config.reviewStats.enabled} onCheckedChange={(value) => { config.reviewStats.enabled = value; saveGlobalOnChange(); }} aria-label="显示当前卡片统计" /></div>
        {#if config.reviewStats.enabled}
          <div class="sortable-list" data-testid="review-stat-options">
            {#each config.reviewStats.order as statKey, index (statKey)}
              <div class="sortable-row">
                <svelte:component this={REVIEW_STAT_ICONS[statKey]} aria-hidden="true" />
                <Switch size="sm" checked={config.reviewStats.visible[statKey]} onCheckedChange={(value) => { config.reviewStats.visible[statKey] = value; saveGlobalOnChange(); }} aria-label={`显示${REVIEW_STAT_LABELS[statKey]}`} />
                <span>{REVIEW_STAT_LABELS[statKey]}</span>
                <div class="sort-actions">
                  <Button variant="ghost" size="icon-xs" title="上移" aria-label={`${REVIEW_STAT_LABELS[statKey]}上移`} disabled={index === 0} onclick={() => moveReviewStat(statKey, "up")}><ArrowUp /></Button>
                  <Button variant="ghost" size="icon-xs" title="下移" aria-label={`${REVIEW_STAT_LABELS[statKey]}下移`} disabled={index === config.reviewStats.order.length - 1} onclick={() => moveReviewStat(statKey, "down")}><ArrowDown /></Button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <section class="settings-section">
        <div class="section-title"><Timer /><div><h3>复习计时</h3><p>在原生复习顶栏显示本轮与当前卡片用时</p></div></div>
        <div class="setting-row master-row"><div><strong>显示复习计时</strong><span>显示本轮总计时和当前闪卡计时</span></div><Switch checked={config.reviewTimerEnabled} onCheckedChange={(value) => { config.reviewTimerEnabled = value; saveGlobalOnChange(); }} aria-label="显示复习计时" /></div>
        {#if config.reviewTimerEnabled}
          <div class="setting-row"><div><strong>智能暂停与恢复</strong><span>切换到其他窗口或页面隐藏时自动暂停，返回后继续计时</span></div><Switch checked={config.reviewTimerPauseOnBlur} onCheckedChange={(value) => { config.reviewTimerPauseOnBlur = value; saveGlobalOnChange(); }} aria-label="智能暂停与恢复" /></div>
          <div class="setting-row"><div><strong>显示答案后继续计时</strong><span>关闭时只统计查看题目的时间（默认）</span></div><Switch checked={config.reviewTimerContinueAfterAnswer} onCheckedChange={(value) => { config.reviewTimerContinueAfterAnswer = value; saveGlobalOnChange(); }} aria-label="显示答案后继续计时" /></div>
        {/if}
      </section>

      <section class="settings-section">
        <div class="section-title"><Settings2 /><div><h3>原生复习工具栏</h3><p>选择复习界面中需要的快捷操作</p></div></div>
        <div class="setting-row master-row"><div><strong>启用工具栏增强</strong><span>将 DAMO 操作融合进原生复习界面</span></div><Switch checked={config.reviewToolbarEnabled} onCheckedChange={(value) => { config.reviewToolbarEnabled = value; saveGlobalOnChange(); }} aria-label="启用工具栏增强" /></div>
        {#if config.reviewToolbarEnabled}
          <div class="option-grid" data-testid="toolbar-options">
            {#each TOOLBAR_OPTIONS as option}
              <div class="option-row"><svelte:component this={option[2]} aria-hidden="true" /><span>{option[1]}</span><Switch size="sm" checked={config[option[0]]} onCheckedChange={(value) => setBooleanSetting(option[0], value)} aria-label={option[1]} /></div>
            {/each}
          </div>
          <div class="setting-row"><div><strong>工具栏动作顺序</strong><span>按动作 ID 排列，支持 DAMO、native.filter、native.fullscreen、native.more 以及其他插件注册的动作</span></div><Textarea aria-label="工具栏动作顺序" bind:value={reviewToolbarActionOrderText} oninput={() => { config.reviewToolbarActionOrder = reviewToolbarActionOrderText.split(/[\\n,]+/u).map((id) => id.trim()).filter(Boolean); saveGlobalOnChange(); }} rows={3} /></div>
          <div class="setting-row"><div><strong>复习工具栏自定义 CSS</strong><span>只作用于原生闪卡复习界面；可使用 [data-damophus-flashcard-action] 选择具体动作</span></div><Textarea aria-label="复习工具栏自定义 CSS" bind:value={config.reviewToolbarCustomCss} rows={7} oninput={saveGlobalOnChange} /></div>
        {/if}
      </section>
    </div>
  {:else}
    <div class="section-heading">
      <h3>SQL 分组</h3>
      <div class="toolbar-actions">
        <Button variant="outline" size="sm" onclick={addCategory}><Plus />新增分类</Button>
        <Button size="sm" onclick={addGroup}><Plus />新增分组</Button>
      </div>
    </div>

    <div class="categories" data-testid="flashcard-categories">
      {#each config.categories as category}
        <div class:active-category={activeCategoryId === category.id} class="category" data-category-id={category.id}>
          {#if editingCategoryId === category.id}
            <Input
              class="category-name-input"
              aria-label="分类名称"
              bind:value={editingCategoryName}
              onkeydown={(event) => {
                if (event.key === "Enter") void commitCategoryRename(category);
                if (event.key === "Escape") cancelCategoryRename();
              }}
            />
            <Button variant="ghost" size="icon-sm" title="保存分类名称" aria-label="保存分类名称" onclick={() => void commitCategoryRename(category)}><Save /></Button>
            <Button variant="ghost" size="icon-sm" title="取消编辑" aria-label="取消编辑" onclick={cancelCategoryRename}><X /></Button>
          {:else}
            <button class="category-select" onclick={() => activeCategoryId = category.id}>{category.name} ({config.groups.filter((group) => group.categoryId === category.id).length})</button>
            <Button variant="ghost" size="icon-sm" title="重命名分类" aria-label="重命名分类" onclick={() => startCategoryRename(category)}><Pencil /></Button>
          {/if}
          {#if config.categories.length > 1}<Button variant="destructive" size="icon-sm" title="删除分类" aria-label="删除分类" onclick={() => deleteCategory(category.id)}><Trash2 /></Button>{/if}
        </div>
      {/each}
    </div>

    <div class="groups" data-testid="flashcard-groups">
    {#each visibleGroups as group (group.id)}
      <article class="group" data-group-id={group.id}>
        <div class="group-row">
          <Input class="group-name" aria-label="分组名称" bind:value={group.name} />
          <label class="inline-switch"><span>启用</span><Switch size="sm" checked={group.enabled} onCheckedChange={(value) => group.enabled = value} /></label>
          <label class="inline-switch"><span>查询优先</span><Switch size="sm" checked={group.queryFirst} onCheckedChange={(value) => group.queryFirst = value} /></label>
          <Select.Root type="single" value={group.categoryId} onValueChange={(value) => group.categoryId = value}>
            <Select.Trigger size="sm" aria-label="分组分类">{config.categories.find((category) => category.id === group.categoryId)?.name ?? "选择分类"}</Select.Trigger>
            <Select.Content>{#each config.categories as category}<Select.Item value={category.id} label={category.name} />{/each}</Select.Content>
          </Select.Root>
          <Button variant="ghost" size="icon-sm" onclick={() => moveGroup(group, "up")} title="上移" aria-label="分组上移"><ArrowUp /></Button>
          <Button variant="ghost" size="icon-sm" onclick={() => moveGroup(group, "down")} title="下移" aria-label="分组下移"><ArrowDown /></Button>
           <Button size="sm" onclick={() => openGroup(group)} aria-label={workbenchMode === "make" ? `检测分组 ${group.name}` : `复习分组 ${group.name}`}><svelte:component this={workbenchMode === "make" ? Search : Play} />{workbenchMode === "make" ? "检测" : "复习到期卡"}</Button>
          <div class="group-action-strip" aria-label="分组操作">
            <Button variant="ghost" size="icon-sm" title="查看原始结果" aria-label="查看原始结果" onclick={() => onViewResults(group, false)}><Eye /></Button>
            <Button variant="ghost" size="icon-sm" title="查看过滤结果" aria-label="查看过滤结果" onclick={() => onViewResults(group, true)}><Filter /></Button>
            <Button variant="ghost" size="icon-sm" title="打开原始文档流" aria-label="打开原始文档流" onclick={() => onOpenRaw(group)}><FileText /></Button>
            <Button variant="ghost" size="icon-sm" title="打开全部文档流" aria-label="打开全部文档流" onclick={() => onOpenFiltered(group)}><Files /></Button>
            <Button variant="ghost" size="icon-sm" title="批量调整优先级" aria-label="批量调整优先级" onclick={() => onBatchPriority(group)}><Gauge /></Button>
            <Button variant="destructive" size="icon-sm" title="删除分组" aria-label="删除分组" onclick={() => deleteGroup(group)}><Trash2 /></Button>
          </div>
        </div>
        <Textarea aria-label="SQL 查询" bind:value={group.sqlQuery} rows={3} />
        <div class="group-options">
          <label>缓存分钟<Input type="number" min="1" bind:value={group.cacheMinutes} /></label>
          <Button variant="outline" size="sm" onclick={() => saveGroup(group)}><Save />保存分组</Button>
        </div>
      </article>
    {:else}<p class="empty">当前分类暂无分组</p>{/each}
    </div>
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
  h3, p { margin: 0; }
  h3 { font-size: 14px; font-weight: 650; letter-spacing: 0; }
  .settings-header, .section-heading, .flashcard-header-actions, .toolbar-actions, .browser-toolbar, .group-row, .group-options {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .settings-header {
    position: sticky;
    top: -14px;
    z-index: 3;
    justify-content: space-between;
    gap: 6px;
    min-height: 42px;
    padding: 7px 0 8px;
    background: var(--background, var(--b3-theme-background));
    border-bottom: 1px solid var(--border, var(--b3-border-color));
  }
  .settings-title { display: flex; align-items: center; gap: 7px; min-width: 0; flex: 0 1 auto; font-size: 14px; }
  .settings-title :global(svg), .section-title > :global(svg) { width: 17px; height: 17px; color: var(--primary, var(--b3-theme-primary)); }
  .workbench-mode-toggle { display: inline-flex; align-items: center; gap: 2px; flex: 0 0 auto; padding: 2px; border: 1px solid var(--border, var(--b3-border-color)); border-radius: 7px; background: color-mix(in srgb, var(--muted, var(--b3-list-hover)) 45%, transparent); box-shadow: inset 0 1px 0 color-mix(in srgb, var(--foreground, var(--b3-theme-on-background)) 5%, transparent); }
  .workbench-mode-toggle :global([data-slot="button"]) { min-width: 70px; }
  .workbench-auto-review, .workbench-timer { display: inline-flex; align-items: center; gap: 6px; min-width: max-content; color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; }
  .flashcard-header-actions {
    display: flex !important;
    flex: 0 0 auto;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    justify-content: flex-end;
    min-width: 0;
    padding-left: 5px;
    border-left: 1px solid var(--border, var(--b3-border-color));
  }
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
  .section-heading { justify-content: space-between; min-height: 38px; }
  .section-heading > div:first-child { min-width: 0; }
  .section-heading p, .section-title p, .setting-row span, .diagnostic-main span, .diagnostic-main small, .browser-summary, .empty {
    color: var(--muted-foreground, var(--b3-theme-on-surface-light));
    font-size: 12px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  label { display: flex; flex-direction: column; gap: 5px; min-width: 0; color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 12px; }
  .inline-switch { flex-direction: row; align-items: center; justify-content: space-between; gap: 8px; min-height: 30px; color: var(--foreground, var(--b3-theme-on-background)); white-space: nowrap; }
  .global-settings, .groups, .diagnostic-list { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .open-documents-panel { position: relative; z-index: 1; display: flex; flex: 0 0 auto; flex-direction: column; gap: 8px; min-width: 0; padding: 10px 12px 12px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 26%, var(--border, var(--b3-border-color))); border-radius: 8px; background: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 5%, var(--background, var(--b3-theme-background))); }
  .open-documents-panel::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 3px; background: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 68%, transparent); opacity: .75; }
  .open-documents-heading { align-items: flex-start; min-height: 32px; }
  .open-documents-heading p { margin-top: 2px; }
  .open-documents-list { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .open-document-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; padding: 8px; border: 1px solid transparent; border-top-color: color-mix(in srgb, var(--border, var(--b3-border-color)) 75%, transparent); border-radius: 6px; }
  .open-document-row:first-child { border-top-color: transparent; }
  .open-document-row:hover { border-color: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 24%, var(--border, var(--b3-border-color))); background: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 5%, transparent); }
  .open-document-row.open-document-active { border-color: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 30%, var(--border, var(--b3-border-color))); background: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 9%, transparent); box-shadow: inset 3px 0 0 var(--primary, var(--b3-theme-primary)); }
  .open-document-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1 1 260px; }
  .open-document-title { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .open-document-title :global(svg) { width: 15px; height: 15px; flex: 0 0 auto; color: var(--primary, var(--b3-theme-primary)); }
  .open-document-title strong, .open-document-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .open-document-title strong { font-size: 13px; }
  .open-document-path { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; }
  .open-document-actions { display: flex; align-items: center; justify-content: flex-end; gap: 5px; flex: 0 1 auto; flex-wrap: wrap; }
  .open-document-actions :global(button) { max-width: 180px; }
  .recent-history-panel { position: relative; z-index: 0; display: flex; flex: 0 0 auto; flex-direction: column; gap: 8px; min-width: 0; margin-top: 4px; padding: 12px 2px 16px; border-top: 2px solid color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 28%, var(--border, var(--b3-border-color))); }
  .recent-history-heading { min-height: 34px; padding-inline: 2px; }
  .settings-section, .group {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
    padding: 0 12px;
    border: 1px solid var(--border, var(--b3-border-color));
    border-radius: 8px;
    background: var(--card, var(--b3-theme-background));
  }
  .section-title { display: flex; align-items: center; gap: 9px; min-height: 54px; padding: 9px 0; border-bottom: 1px solid var(--border, var(--b3-border-color)); }
  .section-title > div { min-width: 0; }
  .field-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--border, var(--b3-border-color)); }
  .setting-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 54px; padding: 9px 0; }
  .setting-row + .setting-row { border-top: 1px solid var(--border, var(--b3-border-color)); }
  .setting-row > div { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 2px; }
  .setting-row strong { font-size: 13px; font-weight: 550; }
  .review-mode-row { align-items: stretch; flex-direction: column; }
  :global(.review-mode-toggle) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: min(100%, 360px); }
  :global(.review-mode-toggle button) { min-width: 0; }
  :global(.review-mode-toggle button[data-state="on"]),
  :global(.review-mode-toggle button[data-state="on"]:hover) {
    z-index: 1;
    border: 1px solid var(--primary, var(--b3-theme-primary, #3573f0)) !important;
    color: var(--primary-foreground, var(--b3-theme-on-primary, #fff)) !important;
    background: var(--primary, var(--b3-theme-primary, #3573f0)) !important;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-foreground, var(--b3-theme-on-primary, #fff)) 24%, transparent);
  }
  :global(.review-mode-toggle .review-mode-check) { width: 14px; height: 14px; margin-left: 2px; stroke-width: 3; }
  .master-row { background: color-mix(in srgb, var(--muted, var(--b3-theme-surface)) 45%, transparent); margin-inline: -12px; padding-inline: 12px; }
  .option-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0 18px; padding: 4px 0 8px; }
  .option-row { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 8px; min-height: 42px; border-bottom: 1px solid var(--border, var(--b3-border-color)); font-size: 12px; }
  .option-row > :global(svg), .sortable-row > :global(svg) { width: 15px; height: 15px; color: var(--primary, var(--b3-theme-primary)); }
  .option-row:nth-last-child(-n + 2) { border-bottom-color: transparent; }
  .sortable-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0 18px; padding: 5px 0 8px; }
  .sortable-row { display: grid; grid-template-columns: 22px 26px minmax(0, 1fr) auto; align-items: center; min-height: 40px; border-bottom: 1px solid var(--border, var(--b3-border-color)); font-size: 12px; }
  .sortable-row:last-child { border-bottom: 0; }
  .sort-actions { display: flex; gap: 2px; }
  .section-actions { display: flex; justify-content: flex-end; padding: 10px 0; border-top: 1px solid var(--border, var(--b3-border-color)); }
  .diagnostic-row { display: flex; align-items: center; gap: 9px; min-width: 0; padding: 10px 4px; border-bottom: 1px solid var(--border, var(--b3-border-color)); }
  .diagnostic-main { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
  .diagnostic-actions { display: flex; align-items: center; gap: 5px; flex: 0 0 auto; }
  .browser-toolbar { flex-wrap: wrap; }
  .browser-toolbar > :global([data-slot="input"]) { flex: 1 1 220px; }
  .browser-toolbar > :global([data-slot="select-trigger"]) { flex: 0 1 150px; }
  .categories { display: flex; flex-wrap: wrap; gap: 6px; }
  .category { display: flex; align-items: center; gap: 2px; min-width: 0; padding: 3px; border: 1px solid var(--border, var(--b3-border-color)); border-radius: 7px; background: var(--card, var(--b3-theme-background)); }
  .category.active-category { border-color: var(--primary, var(--b3-theme-primary)); }
  .category-select { min-height: 28px; padding: 4px 7px; border: 0; color: inherit; background: transparent; cursor: pointer; }
  :global(.category-name-input) { min-width: 140px; font-weight: 600; }
  .group { gap: 10px; padding-block: 12px; }
  .group-row { flex-wrap: wrap; }
  :global(.group-name) { flex: 1 1 180px; font-weight: 600; }
  .group-options { flex-wrap: wrap; justify-content: space-between; }
  .group-action-strip { display: flex; align-items: center; gap: 2px; }
  .group-options label { min-width: 110px; }
  .review-log-header { display: grid; grid-template-columns: minmax(220px, 1fr) auto; align-items: center; gap: 10px 16px; min-width: 0; }
  .review-log-heading { display: grid; grid-template-columns: 34px minmax(0, 1fr); align-items: center; gap: 10px; min-width: 0; }
  .review-log-heading-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 7px; color: var(--primary, var(--b3-theme-primary)); background: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 10%, transparent); }
  .review-log-heading-icon :global(svg) { width: 17px; height: 17px; }
  .review-log-heading h3 { font-size: 15px; }
  .review-log-heading p { margin-top: 2px; color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 12px; line-height: 1.35; }
  .review-log-actions { display: grid; grid-template-columns: repeat(3, max-content); align-items: center; gap: 6px; }
  .review-log-panel { padding-bottom: 12px; }
  .review-log-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; padding: 12px 0; }
  .review-log-summary > div { display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: center; gap: 2px 8px; min-width: 0; padding: 9px; border: 1px solid var(--border, var(--b3-border-color)); border-radius: 7px; }
  .review-log-summary :global(svg) { grid-row: 1 / 3; width: 17px; height: 17px; color: var(--primary, var(--b3-theme-primary)); }
  .review-log-summary span { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; }
  .review-log-summary strong { min-width: 0; font-size: 13px; line-height: 1.35; overflow-wrap: anywhere; }
  .review-log-status { display: flex; flex-wrap: wrap; gap: 6px; padding-bottom: 10px; }
  .review-log-empty { display: flex; min-height: 150px; align-items: center; justify-content: center; flex-direction: column; gap: 8px; color: var(--muted-foreground, var(--b3-theme-on-surface-light)); text-align: center; }
  .review-log-empty > :global(svg) { width: 28px; height: 28px; color: var(--primary, var(--b3-theme-primary)); }
  .review-log-empty span { max-width: 420px; font-size: 12px; }
  :global(.loading-icon) { animation: review-log-spin 1s linear infinite; }
  .review-log-errors { display: flex; flex-direction: column; gap: 6px; padding-top: 8px; border-top: 1px solid var(--border, var(--b3-border-color)); }
  .review-log-errors p { display: flex; flex-wrap: wrap; gap: 6px 10px; font-size: 12px; }
  .review-log-errors span { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); overflow-wrap: anywhere; }
  .review-log-filter { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; padding: 12px; border: 1px solid var(--border, var(--b3-border-color)); border-radius: 8px; background: color-mix(in srgb, var(--muted, var(--b3-list-hover)) 45%, transparent); }
  .review-log-filter-heading { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; align-items: center; gap: 8px; min-width: 0; }
  .review-log-filter-heading > :global(svg) { width: 17px; height: 17px; color: var(--primary, var(--b3-theme-primary)); }
  .review-log-filter-heading div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .review-log-filter-heading span, .review-log-filter-footer span { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; line-height: 1.4; }
  .review-log-filter-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .review-log-filter-grid label { display: flex; flex-direction: column; gap: 5px; min-width: 0; color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; }
  .review-log-filter-grid :global([data-slot="select-trigger"]) { width: 100%; min-width: 0; }
  .review-log-document-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; }
  .review-log-document-controls { display: flex; align-items: center; gap: 5px; min-width: 0; }
  .review-log-document-controls :global([data-slot="input"]) { min-width: 0; flex: 1; }
  .review-log-document-controls :global([data-slot="button"]) { flex: 0 0 auto; }
  .review-log-document-results { display: flex; flex-direction: column; gap: 2px; max-height: 146px; overflow-y: auto; padding: 2px; border: 1px solid var(--border, var(--b3-border-color)); border-radius: 7px; background: var(--background, var(--b3-theme-background)); }
  .review-log-document-results :global(.document-result) { display: flex; align-items: center; justify-content: flex-start; gap: 6px; width: 100%; min-width: 0; padding: 5px 6px; border-radius: 5px; text-align: left; }
  .review-log-document-results :global(.document-result:hover), .review-log-document-results :global(.document-result-active) { background: var(--muted, var(--b3-list-hover)); }
  .review-log-document-results :global(.document-result svg) { width: 14px; height: 14px; flex: 0 0 auto; color: var(--primary, var(--b3-theme-primary)); }
  .review-log-document-results :global(.document-result span) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .review-log-document-empty { padding: 7px; color: var(--muted-foreground, var(--b3-theme-on-surface-light)); }
  .review-log-document-options { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0; }
  .review-log-document-options > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted-foreground, var(--b3-theme-on-surface-light)); }
  .review-log-subdocument-toggle { display: inline-flex !important; flex-direction: row !important; align-items: center; gap: 5px !important; white-space: nowrap; }
  .review-log-filter-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
  .review-log-filter-footer span { min-width: 0; overflow-wrap: anywhere; }
  .optimizer-panel { margin-top: 0; }
  .optimizer-title { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto auto; }
  .optimizer-title > :global([data-slot="button"]) { justify-self: end; }
  .optimizer-result-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; padding: 12px 0; }
  .optimizer-result-summary > div { display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: center; gap: 2px 7px; min-width: 0; padding: 8px; border: 1px solid var(--border, var(--b3-border-color)); border-radius: 7px; }
  .optimizer-result-summary :global(svg) { grid-row: 1 / 3; width: 16px; height: 16px; color: var(--primary, var(--b3-theme-primary)); }
  .optimizer-result-summary span { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; }
  .optimizer-result-summary strong { font-size: 12px; }
  .fsrs-parameter-grid, .fsrs-reference-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 7px; }
  .fsrs-parameter-card, .fsrs-reference-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 7px; min-width: 0; padding: 7px 8px; border: 1px solid var(--border, var(--b3-border-color)); border-radius: 7px; background: color-mix(in srgb, var(--muted, var(--b3-list-hover)) 25%, transparent); }
  .fsrs-parameter-card.changed { border-color: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 48%, var(--border, var(--b3-border-color))); background: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 7%, transparent); }
  .fsrs-parameter-info { display: grid; grid-template-columns: 24px minmax(0, 1fr); align-items: start; gap: 5px; min-width: 0; }
  :global(.fsrs-info-trigger) { display: inline-flex !important; align-items: center; justify-content: center; box-sizing: border-box; width: 24px !important; min-width: 24px !important; height: 24px !important; min-height: 24px !important; padding: 0 !important; border: 1px solid color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 38%, var(--border, var(--b3-border-color))) !important; border-radius: 999px !important; color: var(--primary, var(--b3-theme-primary)) !important; background: transparent !important; box-shadow: none !important; font: inherit; line-height: 1; cursor: help; }
  :global(.fsrs-info-trigger:hover), :global(.fsrs-info-trigger:focus-visible) { background: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 12%, transparent) !important; }
  :global(.fsrs-info-trigger svg) { width: 14px; height: 14px; color: inherit; }
  .fsrs-parameter-copy, .fsrs-reference-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .fsrs-parameter-copy strong, .fsrs-reference-copy strong { min-width: 0; overflow-wrap: anywhere; font-size: 12px; }
  .fsrs-parameter-copy span, .fsrs-reference-copy span { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; line-height: 1.4; }
  .fsrs-parameter-values { display: flex; min-width: 106px; flex-direction: column; align-items: flex-end; gap: 2px; font: 11px ui-monospace, SFMono-Regular, Consolas, monospace; text-align: right; }
  .fsrs-value-diff { display: inline-flex; align-items: center; justify-content: flex-end; gap: 4px; min-width: 0; }
  .fsrs-value-old { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); text-decoration-thickness: 1px; }
  .fsrs-value-new { color: var(--primary, var(--b3-theme-primary)); font-weight: 650; }
  :global(.fsrs-diff-icon) { width: 12px; height: 12px; }
  .fsrs-delta { padding: 1px 4px; border: 1px solid color-mix(in srgb, currentColor 28%, transparent); border-radius: 4px; color: currentColor; font-size: 10px; line-height: 1.25; }
  .fsrs-parameter-values.increased, .fsrs-parameter-card.increased { color: var(--b3-theme-success, #2e8b57); }
  .fsrs-parameter-values.increased .fsrs-value-new, :global(.fsrs-parameter-values.increased .fsrs-diff-icon) { color: var(--b3-theme-success, #2e8b57); }
  .fsrs-parameter-values.decreased, .fsrs-parameter-card.decreased { color: var(--b3-theme-error, #c74444); }
  .fsrs-parameter-values.decreased .fsrs-value-new, :global(.fsrs-parameter-values.decreased .fsrs-diff-icon) { color: var(--b3-theme-error, #c74444); }
  .fsrs-parameter-card.increased { border-color: color-mix(in srgb, var(--b3-theme-success, #2e8b57) 48%, var(--border, var(--b3-border-color))); background: color-mix(in srgb, var(--b3-theme-success, #2e8b57) 7%, transparent); }
  .fsrs-parameter-card.decreased { border-color: color-mix(in srgb, var(--b3-theme-error, #c74444) 48%, var(--border, var(--b3-border-color))); background: color-mix(in srgb, var(--b3-theme-error, #c74444) 7%, transparent); }
  .fsrs-parameter-reference, .fsrs-history-panel { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border, var(--b3-border-color)); }
  .fsrs-reference-heading, .fsrs-history-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
  .fsrs-reference-heading > div, .fsrs-history-heading > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .fsrs-reference-heading strong, .fsrs-history-heading strong { font-size: 13px; }
  .fsrs-reference-heading span, .fsrs-history-heading span { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; line-height: 1.4; }
  .fsrs-reference-row { grid-template-columns: 24px minmax(0, 1fr) auto; }
  .fsrs-reference-row code { min-width: 64px; color: var(--primary, var(--b3-theme-primary)); font-size: 11px; text-align: right; }
  .fsrs-history-list { display: flex; flex-direction: column; gap: 6px; }
  .fsrs-history-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; padding: 7px 8px; border: 1px solid var(--border, var(--b3-border-color)); border-radius: 7px; }
  .fsrs-history-row > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .fsrs-history-row strong { font-size: 12px; }
  .fsrs-history-row span, .fsrs-history-empty { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; }
  .fsrs-history-row span { overflow-wrap: anywhere; }
  .fsrs-history-empty { margin: 0; padding: 7px 0; }
  .optimizer-apply { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0; border-top: 1px solid var(--border, var(--b3-border-color)); }
  .optimizer-empty { display: grid; grid-template-columns: 32px minmax(0, 1fr); align-items: center; gap: 10px; min-height: 88px; padding: 12px 0; }
  .optimizer-empty > :global(svg) { width: 24px; height: 24px; color: var(--primary, var(--b3-theme-primary)); }
  .optimizer-empty div { display: flex; flex-direction: column; gap: 3px; }
  .optimizer-empty strong { font-size: 13px; }
  .optimizer-empty span { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 12px; line-height: 1.45; }
  @keyframes review-log-spin { to { transform: rotate(360deg); } }
  :global(.scope-tree) { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  :global(.tree-branch), :global(.tree-subbranch) { width: 100%; min-height: 36px; padding: 6px 8px; border-radius: 6px; color: var(--foreground, var(--b3-theme-on-background)); font-size: 13px; font-weight: 600; }
  :global(.tree-branch:hover), :global(.tree-subbranch:hover) { background: var(--muted, var(--b3-list-hover)); }
  :global(.tree-subbranch) { min-height: 32px; font-size: 12px; }
  .tree-leaf-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto 28px; align-items: center; gap: 5px; min-width: 0; min-height: 42px; border-bottom: 1px solid var(--border, var(--b3-border-color)); }
  :global(.tree-leaf) { min-width: 0; width: 100%; justify-content: flex-start; color: var(--foreground, var(--b3-theme-on-background)); text-align: left; }
  :global(.tree-leaf span) { min-width: 0; line-height: 1.45; overflow-wrap: anywhere; white-space: normal; }
  .tree-leaf-row > :global([data-slot="badge"]) { max-width: 145px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .message { position: sticky; bottom: 0; align-self: flex-start; margin: 0; padding: 5px 8px; color: var(--primary, var(--b3-theme-primary)); background: var(--background, var(--b3-theme-background)); border: 1px solid var(--border, var(--b3-border-color)); border-radius: 6px; font-size: 12px; }

  @container (max-width: 620px) {
    .flashcard-settings { gap: 10px; padding: 10px 10px 20px; }
    .settings-header { top: -10px; min-height: 38px; }
    .settings-title strong { font-size: 13px; }
    .workbench-mode-toggle :global([data-slot="button"] span), .workbench-auto-review span, .workbench-timer span { display: none; }
    .workbench-mode-toggle :global([data-slot="button"]) { width: 28px; min-width: 28px; padding: 0; }
    .flashcard-header-actions :global([data-slot="button"] span) { display: none; }
    .flashcard-header-actions :global([data-slot="button"]) { width: 28px; padding: 0; }
    .flashcard-settings :global(.flashcard-workbench-tabs) { height: 34px; }
    .flashcard-settings :global(.flashcard-workbench-tabs [data-slot="tabs-trigger"] span) { display: none; }
    .flashcard-settings :global(.flashcard-workbench-tabs [data-slot="tabs-trigger"]) { padding-inline: 0; }
    .field-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .tree-leaf-row { grid-template-columns: 28px minmax(0, 1fr) 28px; padding-block: 4px; }
    .tree-leaf-row > :global([data-slot="badge"]) { grid-column: 2; grid-row: 2; justify-self: start; max-width: 100%; }
    .tree-leaf-row > :global([data-slot="button"]:last-child) { grid-column: 3; grid-row: 1; }
    .diagnostic-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
    .diagnostic-actions { align-self: center; justify-content: flex-end; }
    .browser-toolbar > :global([data-slot="input"]) { flex-basis: 100%; }
    .browser-toolbar > :global([data-slot="select-trigger"]) { flex: 1 1 120px; }
    .group-row > :global([data-slot="button"]:not([data-size])) { flex: 1 1 auto; }
    .review-log-header { grid-template-columns: minmax(0, 1fr); }
    .review-log-actions { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .review-log-actions :global([data-slot="button"]) { width: 100%; min-width: 0; }
    .optimizer-title { grid-template-columns: 20px minmax(0, 1fr) auto; }
    .optimizer-title > :global([data-slot="button"]) { grid-column: 1 / -1; width: 100%; }
    .review-log-filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .open-documents-panel { padding: 8px 10px 10px; }
    .open-document-row { display: grid; grid-template-columns: minmax(0, 1fr); align-items: start; gap: 8px; }
    .open-document-copy { width: 100%; flex: 0 1 auto; }
    .open-document-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); width: 100%; justify-content: stretch; gap: 5px; }
    .open-document-actions :global(button) { width: 100%; max-width: none; min-width: 0; justify-content: flex-start; overflow: hidden; }
    .open-document-actions :global(button span) { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  }

  @container (max-width: 390px) {
    .settings-title strong { display: none; }
    .field-grid { grid-template-columns: 1fr; }
    .review-log-filter-grid { grid-template-columns: 1fr; }
    .option-grid, .sortable-list, .fsrs-parameter-grid, .fsrs-reference-grid { grid-template-columns: 1fr; }
    .setting-row { gap: 10px; }
    .fsrs-parameter-values { min-width: 88px; }
    .toolbar-actions :global([data-slot="button"]), .section-actions :global([data-slot="button"]) { flex: 1; }
  }

  @container (max-width: 330px) {
    .review-log-actions :global([data-slot="button"] span) { display: none; }
    .review-log-actions :global([data-slot="button"]) { min-height: 32px; padding-inline: 0; }
  }
</style>
