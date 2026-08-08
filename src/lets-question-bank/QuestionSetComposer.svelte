<script lang="ts">
  import { ArrowLeft, Check, ChevronRight, FileCheck2, RefreshCw, Save, Trash2 } from "lucide-svelte";
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Checkbox } from "@/components/ui/checkbox";
  import { Label } from "@/components/ui/label";
  import * as Select from "@/components/ui/select";
  import type { QuestionIndexBatchPreview } from "@/question-bank/application";
  import type { QuestionCatalogEntry, FrozenQuestionSet } from "@/question-bank/assembly";
  import {
    QuestionSetBlueprintSchema,
    type QuestionSetBlueprint,
  } from "@/question-bank/assembly";
  import type { QuestionSourceDocument } from "@/question-bank/adapters/siyuan/source-catalog";

  export let catalog: QuestionCatalogEntry[] = [];
  export let documents: QuestionSourceDocument[] = [];
  export let blueprints: QuestionSetBlueprint[] = [];
  export let translations: Record<string, string> = {};
  export let loading = false;
  export let onRefresh: (() => void) | undefined;
  export let onSync: ((documentIds: readonly string[]) => Promise<QuestionIndexBatchPreview>) | undefined;
  export let onConfirmSync: ((preview: QuestionIndexBatchPreview) => Promise<QuestionIndexBatchPreview>) | undefined;
  export let onAssemble: ((blueprint: QuestionSetBlueprint) => FrozenQuestionSet) | undefined;
  export let onSave: ((blueprint: QuestionSetBlueprint) => Promise<void>) | undefined;
  export let onDelete: ((blueprintId: string) => Promise<void>) | undefined;
  export let onUse: ((frozen: FrozenQuestionSet) => void) | undefined;
  export let onClose: (() => void) | undefined;

  const label = (key: string, fallback: string) => translations[`lets-question-bank.${key}`] ?? fallback;
  let step: "sources" | "scan" | "rules" | "preview" = "sources";
  let selectedDocumentIds = new Set<string>();
  let selectedSubjects = new Set<string>();
  let selectedYears = new Set<string>();
  let selectedHistory: QuestionSetBlueprint["filters"]["history"] = "all";
  let questionCount = 20;
  let drawMode: QuestionSetBlueprint["draw_mode"] = "balanced";
  let allowWidening = true;
  let name = "新组卷方案";
  let selectedBlueprintId = "";
  let batchPreview: QuestionIndexBatchPreview | undefined;
  let syncConfirmed = false;
  let frozen: FrozenQuestionSet | undefined;
  let error = "";

  $: availableSubjects = [...new Set(catalog.map((entry) => entry.subject).filter((value): value is string => Boolean(value)))].sort();
  $: availableYears = [...new Set(catalog.map((entry) => entry.year).filter((value): value is string => Boolean(value)))].sort().reverse();
  $: selectedCount = catalog.filter((entry) => selectedDocumentIds.has(entry.documentId)).length;
  $: selectedSourceLabel = selectedDocumentIds.size === 0
    ? label("allSources", "全部已入库题目")
    : `${selectedDocumentIds.size} ${label("documentsSelected", "个文档")}`;

  function toggle(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  function selectAllDocuments(): void {
    selectedDocumentIds = selectedDocumentIds.size === documents.length
      ? new Set()
      : new Set(documents.map((document) => document.documentId));
  }

  async function scanSources(): Promise<void> {
    error = "";
    if (!onSync) {
      step = "rules";
      return;
    }
    loading = true;
    try {
      batchPreview = await onSync([...selectedDocumentIds]);
      syncConfirmed = (batchPreview.documents.every((document) => (
        document.actions.length === 0 && document.staleQuestionIds.length === 0
      )));
      step = "scan";
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading = false;
    }
  }

  async function confirmSources(): Promise<void> {
    if (!batchPreview || !onConfirmSync) return;
    loading = true;
    error = "";
    try {
      batchPreview = await onConfirmSync(batchPreview);
      syncConfirmed = batchPreview.documents.every((document) => document.blockers.length === 0);
      onRefresh?.();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading = false;
    }
  }

  function createBlueprint(): QuestionSetBlueprint {
    const timestamp = new Date().toISOString();
    return QuestionSetBlueprintSchema.parse({
      schema_version: 1,
      blueprint_id: selectedBlueprintId || crypto.randomUUID(),
      revision: selectedBlueprintId ? (blueprints.find((item) => item.blueprint_id === selectedBlueprintId)?.revision ?? 0) + 1 : 1,
      name: name.trim() || label("questionSetDefaultName", "新组卷方案"),
      binding_mode: "dynamic",
      source: {
        notebook_ids: [],
        document_ids: [...selectedDocumentIds],
        topic_refs: [],
        excluded_document_ids: [],
        excluded_question_ids: [],
      },
      filters: {
        subjects: [...selectedSubjects],
        categories: [],
        collections: [],
        sources: [],
        years: [...selectedYears],
        question_types: [],
        history: selectedHistory,
      },
      question_count: Math.max(1, Math.floor(Number(questionCount) || 1)),
      quotas: [],
      draw_mode: drawMode,
      balance_dimensions: ["subject", "category"],
      allow_controlled_widening: allowWidening,
      locked_question_ids: [],
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  function assemble(): void {
    error = "";
    try {
      const blueprint = createBlueprint();
      frozen = onAssemble?.(blueprint);
      if (!frozen) throw new Error(label("questionSetAssemblyUnavailable", "组卷服务尚未连接"));
      step = "preview";
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }

  async function save(): Promise<void> {
    if (!onSave) return;
    try {
      await onSave(createBlueprint());
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }

  async function remove(): Promise<void> {
    if (!onDelete || !selectedBlueprintId) return;
    await onDelete(selectedBlueprintId);
    selectedBlueprintId = "";
  }

  function loadBlueprint(value: string): void {
    selectedBlueprintId = value;
    const blueprint = blueprints.find((item) => item.blueprint_id === value);
    if (!blueprint) return;
    name = blueprint.name;
    questionCount = blueprint.question_count;
    drawMode = blueprint.draw_mode;
    allowWidening = blueprint.allow_controlled_widening;
    selectedDocumentIds = new Set(blueprint.source.document_ids);
    selectedSubjects = new Set(blueprint.filters.subjects);
    selectedYears = new Set(blueprint.filters.years);
    selectedHistory = blueprint.filters.history;
  }
</script>

<section class="question-set-composer flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
  <header class="flex items-center justify-between gap-2">
    <div class="flex min-w-0 items-center gap-2">
      <Button variant="ghost" size="icon" title={label("close", "关闭")} aria-label={label("close", "关闭")} onclick={onClose}><ArrowLeft size={16} /></Button>
      <div class="min-w-0"><strong>{label("questionSet", "跨文档组卷")}</strong><div class="text-xs text-muted-foreground">{selectedSourceLabel} · {selectedCount} {label("candidateQuestions", "道候选题")}</div></div>
    </div>
    <Button variant="outline" size="icon" title={label("refresh", "刷新题源")} aria-label={label("refresh", "刷新题源")} onclick={onRefresh} disabled={loading}><RefreshCw size={16} /></Button>
  </header>

  <nav class="flex items-center gap-1 text-xs" aria-label={label("questionSetSteps", "组卷步骤")}>
    {#each ["sources", "scan", "rules", "preview"] as item, index}
      <Badge variant={step === item ? "default" : "outline"}>{index + 1}. {label(`questionSetStep${item}`, item)}</Badge>
      {#if index < 3}<ChevronRight size={13} class="text-muted-foreground" />{/if}
    {/each}
  </nav>

  {#if error}<div class="rounded border border-destructive/40 px-3 py-2 text-sm text-destructive" role="alert">{error}</div>{/if}

  {#if step === "sources"}
    <section class="min-h-0 flex-1 overflow-y-auto">
      {#if blueprints.length > 0}
        <label class="mb-3 block text-sm">{label("savedBlueprints", "已保存方案")}
          <Select.Root type="single" value={selectedBlueprintId} onValueChange={(value) => loadBlueprint(value ?? "")}>
            <Select.Trigger class="w-full">{selectedBlueprintId ? blueprints.find((item) => item.blueprint_id === selectedBlueprintId)?.name : label("newBlueprint", "新建方案")}</Select.Trigger>
            <Select.Content>{#each blueprints as blueprint (blueprint.blueprint_id)}<Select.Item value={blueprint.blueprint_id} label={blueprint.name} />{/each}</Select.Content>
          </Select.Root>
        </label>
      {/if}
      <div class="mb-2 flex items-center justify-between"><strong>{label("questionSetSources", "选择题源")}</strong><Button variant="ghost" size="sm" onclick={selectAllDocuments}>{selectedDocumentIds.size === documents.length ? label("clearSelection", "清除选择") : label("selectAll", "全选")}</Button></div>
      <div class="grid gap-1">
        {#each documents as document (document.documentId)}
          <label class="flex items-start gap-2 rounded border px-2 py-2 text-sm">
            <Checkbox checked={selectedDocumentIds.has(document.documentId)} onCheckedChange={() => { selectedDocumentIds = toggle(selectedDocumentIds, document.documentId); }} />
            <span class="min-w-0"><strong class="block truncate">{document.title}</strong><small class="text-muted-foreground">{document.hpath ?? document.documentId}</small></span>
          </label>
        {:else}<div class="text-sm text-muted-foreground">{label("noSourceDocuments", "未找到题源文档")}</div>{/each}
      </div>
    </section>
    <Button onclick={scanSources} disabled={loading || documents.length === 0}><FileCheck2 size={16} />{label("scanSelectedSources", "检查并入库")}</Button>
  {:else if step === "scan"}
    <section class="min-h-0 flex-1 overflow-y-auto text-sm">
      <div class="mb-2 flex items-center justify-between"><strong>{label("questionSetScanPreview", "入库检查")}</strong><Badge variant={batchPreview?.blockers.length ? "destructive" : "secondary"}>{batchPreview?.blockers.length ?? 0} {label("blockers", "个阻塞")}</Badge></div>
      {#each batchPreview?.documents ?? [] as document (document.documentId)}
        <div class="mb-2 rounded border px-2 py-2"><div class="flex justify-between"><strong>{document.documentId}</strong><span>{document.scan.report.document.questions.length} {label("questions", "题")}</span></div><small class="text-muted-foreground">+{document.actions.length} / {document.staleQuestionIds.length} {label("indexChanges", "索引变更")}</small>{#if document.blockers.length}<div class="mt-1 text-destructive">{document.blockers.map((item) => item.message).join("；")}</div>{/if}</div>
      {/each}
    </section>
    <div class="flex gap-2">
      <Button variant="outline" onclick={() => step = "sources"}><ArrowLeft size={16} />{label("back", "返回")}</Button>
      {#if !syncConfirmed}<Button onclick={confirmSources} disabled={loading || Boolean(batchPreview?.blockers.length)}><FileCheck2 size={16} />{label("confirmBatchSync", "确认入库")}</Button>{/if}
      <Button onclick={() => step = "rules"} disabled={Boolean(batchPreview?.blockers.length) || !syncConfirmed}>{label("continueRules", "继续设置")}</Button>
    </div>
  {:else if step === "rules"}
    <section class="min-h-0 flex-1 overflow-y-auto grid gap-3 text-sm">
      <label>{label("questionSetName", "方案名称")}<Input bind:value={name} /></label>
      <label>{label("questionCount", "题量")}<Input type="number" min="1" bind:value={questionCount} /></label>
      <div><strong class="mb-1 block">{label("subjects", "科目")}</strong><div class="flex flex-wrap gap-1">{#each availableSubjects as subject}<Label class="flex items-center gap-1 rounded border px-2 py-1"><Checkbox checked={selectedSubjects.has(subject)} onCheckedChange={() => { selectedSubjects = toggle(selectedSubjects, subject); }} />{subject}</Label>{/each}</div></div>
      <div><strong class="mb-1 block">{label("years", "年份")}</strong><div class="flex flex-wrap gap-1">{#each availableYears as year}<Label class="flex items-center gap-1 rounded border px-2 py-1"><Checkbox checked={selectedYears.has(year)} onCheckedChange={() => { selectedYears = toggle(selectedYears, year); }} />{year}</Label>{/each}</div></div>
      <Label>{label("historyFilter", "作答历史")}
        <Select.Root type="single" value={selectedHistory} onValueChange={(value) => { if (value) selectedHistory = value as typeof selectedHistory; }}><Select.Trigger>{selectedHistory}</Select.Trigger><Select.Content><Select.Item value="all" label={label("allQuestions", "全部题")} /><Select.Item value="unattempted" label={label("unattempted", "未做题")} /><Select.Item value="wrong" label={label("wrong", "错题")} /><Select.Item value="review" label={label("review", "待复习")} /><Select.Item value="again-hard" label="Again / Hard" /></Select.Content></Select.Root>
      </Label>
      <Label>{label("drawMode", "抽取方式")}
        <Select.Root type="single" value={drawMode} onValueChange={(value) => { if (value) drawMode = value as typeof drawMode; }}><Select.Trigger>{drawMode}</Select.Trigger><Select.Content><Select.Item value="balanced" label={label("balanced", "均衡抽取")} /><Select.Item value="uniform" label={label("uniform", "完全随机")} /></Select.Content></Select.Root>
      </Label>
      <Label class="flex items-center gap-2"><Checkbox bind:checked={allowWidening} />{label("allowWidening", "题量不足时先放宽年份")}</Label>
    </section>
    <div class="flex gap-2"><Button variant="outline" onclick={() => step = batchPreview ? "scan" : "sources"}><ArrowLeft size={16} />{label("back", "返回")}</Button><Button variant="outline" onclick={save}><Save size={16} />{label("saveBlueprint", "保存方案")}</Button><Button onclick={assemble}>{label("previewSet", "预览试卷")}</Button></div>
  {:else}
    <section class="min-h-0 flex-1 overflow-y-auto text-sm">
      <div class="mb-2 flex items-center justify-between"><strong>{name}</strong><Badge variant={frozen?.deficits.length ? "destructive" : "secondary"}>{frozen?.question_ids.length ?? 0} / {questionCount}</Badge></div>
      {#if frozen?.widened}<div class="mb-2 rounded border border-yellow-500/50 px-2 py-2">{label("setWidened", "候选不足，已按规则放宽年份范围")}</div>{/if}
      {#each frozen?.deficits ?? [] as deficit}<div class="mb-1 text-destructive">{deficit.dimension} {deficit.value ?? ""}: {deficit.available} / {deficit.requested}</div>{/each}
      <ol class="grid gap-1">{#each frozen?.question_ids ?? [] as questionId, index}<li class="rounded border px-2 py-1">{index + 1}. {catalog.find((entry) => entry.questionId === questionId)?.questionTitle ?? questionId}</li>{/each}</ol>
    </section>
    <div class="flex gap-2"><Button variant="outline" onclick={() => step = "rules"}><ArrowLeft size={16} />{label("back", "返回")}</Button><Button onclick={() => frozen && onUse?.(frozen)} disabled={!frozen || Boolean(frozen?.deficits.length)}><Check size={16} />{label("useQuestionSet", "用于考试/练习")}</Button>{#if selectedBlueprintId}<Button variant="ghost" size="icon" title={label("deleteBlueprint", "删除方案")} aria-label={label("deleteBlueprint", "删除方案")} onclick={remove}><Trash2 size={16} /></Button>{/if}</div>
  {/if}
</section>
