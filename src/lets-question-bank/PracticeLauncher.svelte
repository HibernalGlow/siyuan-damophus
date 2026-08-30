<script lang="ts">
  import {
    BookOpenCheck,
    Bookmark,
    Check,
    Circle,
    ListChecks,
    ListOrdered,
    RotateCcw,
    Save,
    Shuffle,
    SlidersHorizontal,
    Target,
    Trash2,
    X,
  } from "lucide-svelte";
  import * as Alert from "@/components/ui/alert";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Label as FormLabel } from "@/components/ui/label";
  import * as Select from "@/components/ui/select";
  import * as ToggleGroup from "@/components/ui/toggle-group";
  import type { PracticeFilter } from "@/question-bank/core/scope";
  import type { PracticeFilterPreset } from "./practice-preferences";
  import type { PracticeOptionOrder, PracticeOrder } from "@/question-bank/application";
  import type { QuestionIndexPreview } from "@/question-bank/application";
  import type { TopicNode } from "@/question-bank/core/types";
  import type { SourceBlockIdentity } from "./controller";
  import { topicLabel } from "./question-bank-display";
  import PracticeConditionEditor from "./PracticeConditionEditor.svelte";

  export let label: (key: string, fallback: string) => string;
  export let preview: QuestionIndexPreview;
  export let sourceIdentity: SourceBlockIdentity | undefined = undefined;
  export let progressQuestionCount = 0;
  export let attemptedQuestions = 0;
  export let untouchedQuestions = 0;
  export let wrongQuestions = 0;
  export let reviewQuestions = 0;
  export let reviewAgainQuestions = 0;
  export let reviewHardQuestions = 0;
  export let bookmarkedQuestions = 0;
  export let syncComplete = false;
  export let busy = false;
  export let recoverableSession: any;
  export let resumePractice: () => void;
  export let pendingReplacement = false;
  export let confirmRestartPractice: () => void;
  export let topicId = "";
  export let topics: TopicNode[] = [];
  export let order: PracticeOrder = "sequential";
  export let optionOrder: PracticeOptionOrder = "random";
  export let filter: PracticeFilter = "all";
  export let filterPresets: PracticeFilterPreset[] = [];
  export let activeFilterPresetId: string | undefined = undefined;
  export let startPractice: () => void;

  const entireDocumentScope = "__damophus_entire_document__";
  $: blocked = preview.blockers.length > 0
    || preview.bindingRepairs.length > 0
    || (!syncComplete && preview.actions.some((action) => action.kind === "add"));

  let presetName = "";

  function selectPreset(id: string): void {
    const preset = filterPresets.find((candidate) => candidate.id === id);
    if (!preset) return;
    activeFilterPresetId = preset.id;
    filter = preset.filter;
    presetName = preset.name;
  }

  function savePreset(): void {
    const name = presetName.trim();
    if (!name) return;
    const id = typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `preset-${Date.now()}`;
    filterPresets = [...filterPresets, { id, name, filter }];
    activeFilterPresetId = id;
  }

  function removePreset(id: string): void {
    filterPresets = filterPresets.filter((preset) => preset.id !== id);
    if (activeFilterPresetId === id) activeFilterPresetId = undefined;
  }
</script>

<section class="practice-launcher" aria-labelledby="practice-launcher-heading" data-testid="practice-launcher">
  <header class="practice-launcher-header">
    <div class="practice-launcher-title">
      <span class="practice-launcher-icon" aria-hidden="true"><BookOpenCheck /></span>
      <div>
        <span class="practice-launcher-kicker">{label("answerWorkspace", "答题")}</span>
        <strong id="practice-launcher-heading">{label("quickPractice", "快速练习")}</strong>
        <small>{sourceIdentity?.content ?? label("currentDocument", "当前文档")}</small>
      </div>
    </div>

    <dl class="practice-launcher-stats" aria-label={label("practiceProgress", "练习进度")}>
      <div><dt>{label("questions", "题")}</dt><dd><ListChecks size={13} aria-hidden="true" /><span>{progressQuestionCount}</span></dd></div>
      <div><dt>{label("attempted", "已作答")}</dt><dd><Check size={13} aria-hidden="true" /><span>{attemptedQuestions}</span></dd></div>
      <div><dt>{label("untouched", "未作答")}</dt><dd><Circle size={11} aria-hidden="true" /><span>{untouchedQuestions}</span></dd></div>
      <div><dt>{label("wrong", "错题")}</dt><dd><X size={13} aria-hidden="true" /><span>{wrongQuestions}</span></dd></div>
      <div>
        <dt>{label("review", "待复习")}</dt>
        <dd>
          <RotateCcw size={12} aria-hidden="true" />
          <span>{reviewQuestions}</span>
          <small>{label("again", "Again")} {reviewAgainQuestions} · {label("hard", "Hard")} {reviewHardQuestions}</small>
        </dd>
      </div>
      <div><dt>{label("bookmarked", "已收藏")}</dt><dd><Bookmark size={12} aria-hidden="true" /><span>{bookmarkedQuestions}</span></dd></div>
    </dl>
  </header>

  {#if recoverableSession}
    <div class="session-recovery">
      <div>
        <strong>{label("unfinishedFound", "发现未完成练习")}</strong>
        <span>{recoverableSession.completed_question_ids.length} / {recoverableSession.queue_question_ids.length}</span>
      </div>
      <div class="session-recovery-actions">
        <Button onclick={resumePractice}>{label("continue", "继续答题")}</Button>
        <Button variant="outline" onclick={() => pendingReplacement = true}>{label("newSettings", "使用新设置")}</Button>
      </div>
    </div>
  {/if}

  {#if pendingReplacement && recoverableSession}
    <Alert.Root variant="destructive" class="w-auto">
      <Alert.Title>{label("replaceSession", "替换未完成练习？")}</Alert.Title>
      <Alert.Description>{label("replaceSessionDescription", "草稿进度将被移除，已提交的作答记录会保留。")}</Alert.Description>
      <div class="mt-3 flex flex-wrap gap-2">
        <Button variant="destructive" size="sm" onclick={confirmRestartPractice}>{label("confirmRestart", "替换并开始")}</Button>
        <Button variant="outline" size="sm" onclick={() => pendingReplacement = false}>{label("cancel", "取消")}</Button>
      </div>
    </Alert.Root>
  {/if}

  <div class="practice-launcher-body">
    <div class="practice-launcher-form">
      <div class="scope-control control-block">
        <FormLabel><Target size={12} aria-hidden="true" />{label("scope", "答题范围")}</FormLabel>
        <Select.Root
          type="single"
          value={topicId || entireDocumentScope}
          onValueChange={(value) => topicId = value === entireDocumentScope ? "" : value}
        >
          <Select.Trigger class="w-full">
            <span>{topicId ? topicLabel(topics.find((topic) => topic.id === topicId) ?? topics[0]) : label("entireDocument", "整个文档")}</span>
          </Select.Trigger>
          <Select.Content portalProps={{ disabled: true }}>
            <Select.Item value={entireDocumentScope} label={label("entireDocument", "整个文档")}>
              {label("entireDocument", "整个文档")}
            </Select.Item>
            {#each topics as topic (topic.id)}
              <Select.Item value={topic.id} label={topicLabel(topic)}>
                {topicLabel(topic)}
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div class="practice-order-grid">
        <fieldset class="control-block">
          <legend><ListOrdered size={12} aria-hidden="true" />{label("questionOrder", "出题顺序")}</legend>
          <ToggleGroup.Root
            type="single"
            variant="outline"
            class="grid w-full grid-cols-2"
            value={order}
            onValueChange={(value) => { if (value) order = value as PracticeOrder; }}
          >
            <ToggleGroup.Item value="sequential" title={label("sequentialQuestions", "顺序出题")} aria-label={label("sequentialQuestions", "顺序出题")}>
              <ListOrdered aria-hidden="true" />
              <span>{label("sequentialQuestions", "顺序出题")}</span>
            </ToggleGroup.Item>
            <ToggleGroup.Item value="random" title={label("randomQuestions", "随机出题")} aria-label={label("randomQuestions", "随机出题")}>
              <Shuffle aria-hidden="true" />
              <span>{label("randomQuestions", "随机出题")}</span>
            </ToggleGroup.Item>
          </ToggleGroup.Root>
        </fieldset>

        <fieldset class="control-block">
          <legend><Shuffle size={12} aria-hidden="true" />{label("optionOrder", "选项顺序")}</legend>
          <ToggleGroup.Root
            type="single"
            variant="outline"
            class="grid w-full grid-cols-2"
            value={optionOrder}
            onValueChange={(value) => { if (value) optionOrder = value as PracticeOptionOrder; }}
          >
            <ToggleGroup.Item value="source" title={label("sourceOptions", "选项原序")} aria-label={label("sourceOptions", "选项原序")}>
              <ListOrdered aria-hidden="true" />
              <span>{label("sourceOptions", "选项原序")}</span>
            </ToggleGroup.Item>
            <ToggleGroup.Item value="random" title={label("randomOptions", "选项随机")} aria-label={label("randomOptions", "选项随机")}>
              <Shuffle aria-hidden="true" />
              <span>{label("randomOptions", "选项随机")}</span>
            </ToggleGroup.Item>
          </ToggleGroup.Root>
        </fieldset>
      </div>

      <fieldset class="control-block filter-control">
        <legend><SlidersHorizontal size={12} aria-hidden="true" />{label("filter", "题目筛选")}</legend>
        <div class="filter-preset-toolbar">
          <div class="filter-preset-heading">
            <Bookmark size={14} aria-hidden="true" />
            <span>{label("filterPresets", "筛选预设")}</span>
          </div>
          <Input
            class="filter-preset-name"
            bind:value={presetName}
            placeholder={label("filterPresetNamePlaceholder", "预设名称")}
            aria-label={label("filterPresetName", "筛选预设名称")}
          />
          <Button
            variant="outline"
            size="icon"
            title={label("saveFilterPreset", "保存筛选预设")}
            aria-label={label("saveFilterPreset", "保存筛选预设")}
            disabled={!presetName.trim()}
            onclick={savePreset}
          ><Save size={15} aria-hidden="true" /></Button>
        </div>
        {#if filterPresets.length > 0}
          <div class="filter-preset-list" aria-label={label("filterPresets", "筛选预设")}>
            {#each filterPresets as preset (preset.id)}
              <div class:active={preset.id === activeFilterPresetId} class="filter-preset-row">
                <button type="button" class="filter-preset-select" onclick={() => selectPreset(preset.id)} aria-pressed={preset.id === activeFilterPresetId}>
                  <Bookmark size={14} aria-hidden="true" />
                  <span>{preset.name}</span>
                  {#if preset.id === activeFilterPresetId}<Check size={14} aria-hidden="true" />{/if}
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={label("deleteFilterPreset", "删除筛选预设")}
                  aria-label={`${label("deleteFilterPreset", "删除筛选预设")} ${preset.name}`}
                  onclick={() => removePreset(preset.id)}
                ><Trash2 size={14} aria-hidden="true" /></Button>
              </div>
            {/each}
          </div>
        {/if}
        <PracticeConditionEditor {label} bind:filter />
      </fieldset>
    </div>

    <aside class="practice-launcher-actions" aria-label={label("practiceModes", "答题模式")}>
      <Button class="practice-primary-action" disabled={busy || blocked} onclick={startPractice}>
        <BookOpenCheck aria-hidden="true" />
        <span><strong>{label("start", "开始练习")}</strong><small>{label("startPracticeHint", "按当前设置立即答题")}</small></span>
      </Button>
      {#if blocked}
        <p>{label("practiceBlockedHint", "完成必要的扫描或索引同步后即可开始答题。")}</p>
      {/if}
    </aside>
  </div>
</section>

<style>
  .practice-launcher {
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 38%, var(--b3-border-color));
    border-radius: 8px;
    background: var(--b3-theme-background);
    overflow: hidden;
  }

  .practice-launcher-header {
    min-height: 78px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--b3-border-color);
    background: color-mix(in srgb, var(--b3-theme-primary-lightest) 45%, var(--b3-theme-background));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    flex-wrap: wrap;
  }

  .practice-launcher-title,
  .practice-launcher-title > div {
    min-width: 0;
  }

  .practice-launcher-title {
    display: flex;
    align-items: center;
    gap: 11px;
  }

  .practice-launcher-title > div {
    display: grid;
    gap: 1px;
  }

  .practice-launcher-icon {
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
    border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 38%, transparent);
    border-radius: 7px;
    color: var(--b3-theme-primary);
    background: var(--b3-theme-background);
    display: grid;
    place-items: center;
  }

  .practice-launcher-icon :global(svg) {
    width: 19px;
    height: 19px;
  }

  .practice-launcher-kicker {
    color: var(--b3-theme-primary);
    font-size: 11px;
    font-weight: 700;
  }

  .practice-launcher-title strong {
    font-size: 17px;
    line-height: 1.35;
  }

  .practice-launcher-title small {
    overflow: hidden;
    color: var(--b3-theme-on-surface);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .practice-launcher-stats {
    flex: 1 1 460px;
    min-width: min(100%, 360px);
    margin: 0;
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0;
  }

  .practice-launcher-stats div {
    min-width: 0;
    padding: 1px clamp(7px, 1.2vw, 13px);
    border-left: 1px solid var(--b3-border-color);
    display: flex;
    flex-direction: column-reverse;
    gap: 2px;
  }

  .practice-launcher-stats dt {
    color: var(--b3-theme-on-surface);
    font-size: 11px;
    white-space: nowrap;
  }

  .practice-launcher-stats dd {
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 4px;
    font-size: 18px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .practice-launcher-stats dd :global(svg) {
    align-self: center;
    color: var(--b3-theme-on-surface);
  }

  .practice-launcher-stats dd small {
    display: block;
    flex-basis: 100%;
    margin-top: 2px;
    color: var(--b3-theme-on-surface);
    font-size: 10px;
    font-weight: 400;
    line-height: 1.2;
    white-space: nowrap;
  }

  .session-recovery {
    margin: 14px 16px 0;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 34%, var(--b3-border-color));
    border-radius: 6px;
    background: color-mix(in srgb, var(--b3-theme-primary-lightest) 38%, transparent);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .session-recovery > div:first-child {
    display: flex;
    align-items: baseline;
    gap: 9px;
  }

  .session-recovery span {
    color: var(--b3-theme-on-surface);
    font-size: 12px;
  }

  .session-recovery-actions {
    display: flex;
    gap: 8px;
  }

  .practice-launcher > :global([data-slot="alert"]) {
    margin: 14px 16px 0;
  }

  .practice-launcher-body {
    padding: 16px;
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .practice-launcher-form {
    min-width: 0;
    display: grid;
    gap: 14px;
  }

  .control-block {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
    display: grid;
    gap: 6px;
  }

  .control-block :global([data-slot="toggle-group"]) {
    min-width: 0;
  }

  .control-block :global([data-slot="toggle-group-item"]) {
    min-width: 0;
  }

  .control-block :global([data-slot="toggle-group-item"] span) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .control-block legend,
  .control-block :global(label) {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--b3-theme-on-surface);
    font-size: 12px;
  }

  .control-block legend :global(svg),
  .control-block :global(label svg) {
    color: var(--b3-theme-primary);
  }

  .filter-preset-toolbar {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .filter-preset-heading {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--b3-theme-on-surface);
    font-size: 11px;
  }

  .filter-preset-heading :global(svg) {
    color: var(--b3-theme-primary);
  }

  :global(.filter-preset-name) {
    min-width: 120px;
    flex: 1 1 180px;
  }

  .filter-preset-toolbar :global(button) {
    flex: 0 0 auto;
  }

  .filter-preset-list {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .filter-preset-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 3px;
    border: 1px solid var(--b3-border-color);
    border-radius: 5px;
    background: var(--b3-theme-background);
  }

  .filter-preset-row.active {
    border-color: color-mix(in srgb, var(--b3-theme-primary) 56%, var(--b3-border-color));
    background: color-mix(in srgb, var(--b3-theme-primary) 10%, var(--b3-theme-background));
  }

  .filter-preset-select {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 9px;
    border: 0;
    color: var(--b3-theme-on-background);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .filter-preset-select span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .filter-preset-select :global(svg:last-child) {
    flex: 0 0 auto;
    margin-left: auto;
    color: var(--b3-theme-primary);
  }

  .filter-preset-row > :global(button) {
    margin-right: 3px;
    color: var(--b3-theme-on-surface);
  }

  .practice-order-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .practice-launcher-actions {
    min-width: 0;
    padding-top: 14px;
    border-top: 1px solid var(--b3-border-color);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
  }

  .practice-launcher-actions :global(button) {
    width: auto;
    min-width: 220px;
    height: auto;
    min-height: 46px;
    padding: 9px 18px;
    justify-content: center;
    text-align: center;
  }

  .practice-launcher-actions :global(button > span) {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .practice-launcher-actions :global(button strong) {
    font-size: 13px;
  }

  .practice-launcher-actions :global(button small) {
    color: inherit;
    font-size: 10px;
    font-weight: 400;
    opacity: 0.76;
    white-space: nowrap;
  }

  :global(.practice-primary-action) {
    min-height: 48px !important;
  }

  :global(.practice-primary-action svg) {
    width: 20px;
    height: 20px;
  }

  :global(.practice-primary-action strong) {
    font-size: 14px;
  }

  .practice-launcher-actions p {
    margin: 0 auto 0 0;
    color: var(--b3-theme-on-surface);
    font-size: 11px;
    line-height: 1.5;
  }

  @container (max-width: 900px) {
    .practice-launcher-header {
      align-items: flex-start;
    }

    .practice-launcher-stats {
      flex-basis: 100%;
      min-width: 0;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      row-gap: 0;
    }

  }

  @container (max-width: 700px) {
    .practice-order-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    :global(.practice-order-grid [data-slot="toggle-group"]) {
      padding: 3px;
      gap: 2px;
      border: 1px solid var(--b3-border-color);
      border-radius: 12px;
      background: var(--b3-theme-surface);
    }

    :global(.practice-order-grid [data-slot="toggle-group-item"]) {
      min-width: 0;
      min-height: 38px;
      gap: 5px;
      padding-inline: 6px;
      border: 0;
      border-radius: 9px;
      color: var(--b3-theme-on-surface);
      background: transparent;
      font-size: 12px;
    }

    :global(.practice-order-grid [data-slot="toggle-group-item"] svg) {
      width: 15px;
      height: 15px;
    }

    :global(.practice-order-grid [data-slot="toggle-group-item"][data-state="on"]) {
      color: var(--b3-theme-primary);
      background: color-mix(in srgb, var(--b3-theme-primary) 14%, transparent);
    }

    .scope-control :global([data-slot="select-trigger"]) {
      min-height: 42px;
      border-radius: 10px;
    }

    /* 窄屏把主操作提到表单之上：即使上方"未完成的练习"等区块很高，
       "开始练习"也始终紧跟在统计带后面，不会被挤到首屏之外。 */
    .practice-launcher-actions {
      order: -1;
      flex-direction: column;
      align-items: stretch;
      justify-content: stretch;
      gap: 8px;
      padding: 0 0 13px;
      border-top: 0;
      border-bottom: 1px solid var(--b3-border-color);
    }

    .practice-launcher-actions p {
      margin: 0;
      text-align: center;
    }

    .practice-launcher-actions :global(button) {
      width: 100%;
      min-width: 0;
      min-height: 54px;
      border-radius: 12px;
      justify-content: center;
    }

    .practice-launcher-actions :global(button > span) {
      flex-direction: column;
      align-items: center;
      gap: 1px;
      text-align: center;
    }

    .practice-launcher-actions :global(button small) {
      white-space: normal;
    }

    :global(.practice-primary-action) {
      min-height: 56px !important;
      box-shadow: 0 4px 14px color-mix(in srgb, var(--b3-theme-primary) 26%, transparent);
    }
  }

  @container (max-width: 620px) {
    .practice-launcher {
      border-radius: 12px;
    }

    .practice-launcher-header {
      display: grid;
      gap: 10px;
      padding: 12px 14px 11px;
    }

    .practice-launcher-stats {
      width: 100%;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      row-gap: 0;
      padding-top: 10px;
      border-top: 1px solid var(--b3-border-color);
    }

    .practice-launcher-stats div {
      padding-inline: 5px;
    }

    .practice-launcher-stats div:first-child {
      border-left: 0;
      padding-left: 0;
    }

    .practice-launcher-stats dd {
      gap: 3px;
      font-size: 15px;
    }

    .practice-launcher-stats dd :global(svg) {
      width: 12px;
      height: 12px;
    }

    .practice-launcher-stats dt {
      font-size: 9.5px;
    }

    .practice-launcher-body {
      padding: 14px;
    }

    .session-recovery {
      align-items: stretch;
      flex-direction: column;
    }

    .session-recovery-actions > :global(*) {
      flex: 1;
    }
  }

  @container (max-width: 430px) {
    .practice-launcher-body {
      padding: 12px;
      gap: 12px;
    }

    .practice-launcher-form {
      gap: 12px;
    }

    .practice-launcher-kicker {
      display: none;
    }

    .practice-launcher-stats dd small {
      display: none;
    }

    .practice-order-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .practice-order-grid legend {
      font-size: 11px;
    }

    :global(.practice-order-grid [data-slot="toggle-group-item"]) {
      min-height: 36px;
      gap: 3px;
      padding-inline: 2px;
      font-size: 10.5px;
    }

    :global(.practice-order-grid [data-slot="toggle-group-item"] svg) {
      width: 12px;
      height: 12px;
    }

    .filter-preset-toolbar {
      align-items: center;
    }

    .filter-preset-heading {
      display: none;
    }

    :global(.filter-preset-name) {
      min-width: 0;
      flex-basis: auto;
      flex: 1 1 auto;
    }
  }
</style>
