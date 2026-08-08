<script lang="ts">
  import {
    BookOpenCheck,
    CircleDashed,
    CircleX,
    Clock3,
    List,
    ListOrdered,
    RotateCcw,
    Shuffle,
  } from "lucide-svelte";
  import * as Alert from "@/components/ui/alert";
  import { Button } from "@/components/ui/button";
  import { Label as FormLabel } from "@/components/ui/label";
  import * as Select from "@/components/ui/select";
  import * as ToggleGroup from "@/components/ui/toggle-group";
  import type { PracticeFilter } from "@/question-bank/core/scope";
  import type { PracticeOptionOrder, PracticeOrder } from "@/question-bank/application";
  import type { QuestionIndexPreview } from "@/question-bank/application";
  import type { TopicNode } from "@/question-bank/core/types";
  import type { SourceBlockIdentity } from "./controller";
  import { topicLabel } from "./question-bank-display";

  export let label: (key: string, fallback: string) => string;
  export let preview: QuestionIndexPreview;
  export let sourceIdentity: SourceBlockIdentity | undefined = undefined;
  export let progressQuestionCount = 0;
  export let attemptedQuestions = 0;
  export let untouchedQuestions = 0;
  export let reviewQuestions = 0;
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
  export let startPractice: () => void;

  const entireDocumentScope = "__damophus_entire_document__";
  $: blocked = preview.blockers.length > 0
    || preview.bindingRepairs.length > 0
    || (!syncComplete && preview.actions.some((action) => action.kind === "add"));
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
      <div><dt>{label("questions", "题")}</dt><dd>{progressQuestionCount}</dd></div>
      <div><dt>{label("attempted", "已作答")}</dt><dd>{attemptedQuestions}</dd></div>
      <div><dt>{label("untouched", "未作答")}</dt><dd>{untouchedQuestions}</dd></div>
      <div><dt>{label("review", "待复习")}</dt><dd>{reviewQuestions}</dd></div>
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
        <FormLabel>{label("scope", "答题范围")}</FormLabel>
        <Select.Root
          type="single"
          value={topicId || entireDocumentScope}
          onValueChange={(value) => topicId = value === entireDocumentScope ? "" : value}
        >
          <Select.Trigger class="w-full">
            {topicId ? topicLabel(topics.find((topic) => topic.id === topicId) ?? topics[0]) : label("entireDocument", "整个文档")}
          </Select.Trigger>
          <Select.Content>
            <Select.Group>
              <Select.Item value={entireDocumentScope} label={label("entireDocument", "整个文档")} />
              {#each topics as topic (topic.id)}
                <Select.Item value={topic.id} label={topicLabel(topic)} />
              {/each}
            </Select.Group>
          </Select.Content>
        </Select.Root>
      </div>

      <div class="practice-order-grid">
        <fieldset class="control-block">
          <legend>{label("questionOrder", "出题顺序")}</legend>
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
          <legend>{label("optionOrder", "选项顺序")}</legend>
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
        <legend>{label("filter", "题目筛选")}</legend>
        <ToggleGroup.Root
          type="single"
          variant="outline"
          class="practice-filter-group"
          value={filter}
          onValueChange={(value) => { if (value) filter = value as PracticeFilter; }}
        >
          <ToggleGroup.Item value="all" title={label("all", "全部")} aria-label={label("all", "全部")}><List aria-hidden="true" /><span>{label("all", "全部")}</span></ToggleGroup.Item>
          <ToggleGroup.Item value="unattempted" title={label("unattempted", "未做题")} aria-label={label("unattempted", "未做题")}><CircleDashed aria-hidden="true" /><span>{label("unattempted", "未做题")}</span></ToggleGroup.Item>
          <ToggleGroup.Item value="wrong" title={label("wrong", "错题")} aria-label={label("wrong", "错题")}><CircleX aria-hidden="true" /><span>{label("wrong", "错题")}</span></ToggleGroup.Item>
          <ToggleGroup.Item value="review" title={label("review", "待复习")} aria-label={label("review", "待复习")}><RotateCcw aria-hidden="true" /><span>{label("review", "待复习")}</span></ToggleGroup.Item>
          <ToggleGroup.Item value="due" title={label("due", "闪卡到期")} aria-label={label("due", "闪卡到期")}><Clock3 aria-hidden="true" /><span>{label("due", "闪卡到期")}</span></ToggleGroup.Item>
        </ToggleGroup.Root>
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
    margin: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(58px, auto));
    gap: 0;
  }

  .practice-launcher-stats div {
    min-width: 62px;
    padding: 1px 13px;
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
    font-size: 18px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
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
    grid-template-columns: minmax(0, 1fr) minmax(220px, 268px);
    gap: 18px;
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
    color: var(--b3-theme-on-surface);
    font-size: 12px;
  }

  .practice-order-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  :global(.practice-filter-group) {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .practice-launcher-actions {
    min-width: 0;
    padding-left: 18px;
    border-left: 1px solid var(--b3-border-color);
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .practice-launcher-actions :global(button) {
    width: 100%;
    height: auto;
    min-height: 50px;
    padding: 9px 11px;
    justify-content: flex-start;
    text-align: left;
  }

  .practice-launcher-actions :global(button > span) {
    min-width: 0;
    display: grid;
    gap: 1px;
  }

  .practice-launcher-actions :global(button strong) {
    font-size: 13px;
  }

  .practice-launcher-actions :global(button small) {
    overflow: hidden;
    color: inherit;
    font-size: 10px;
    font-weight: 400;
    opacity: 0.76;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.practice-primary-action) {
    min-height: 66px !important;
  }

  :global(.practice-primary-action svg) {
    width: 20px;
    height: 20px;
  }

  :global(.practice-primary-action strong) {
    font-size: 14px;
  }

  .practice-launcher-actions p {
    margin: 2px 0 0;
    color: var(--b3-theme-on-surface);
    font-size: 11px;
    line-height: 1.5;
  }

  @container (max-width: 900px) {
    .practice-launcher-header {
      align-items: flex-start;
    }

    .practice-launcher-stats {
      grid-template-columns: repeat(2, minmax(58px, auto));
      row-gap: 8px;
    }

    .practice-launcher-body {
      grid-template-columns: 1fr;
    }

    .practice-launcher-actions {
      padding: 14px 0 0;
      border-top: 1px solid var(--b3-border-color);
      border-left: 0;
    }

  }

  @container (max-width: 700px) {
    .practice-order-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    :global(.practice-order-grid [data-slot="toggle-group-item"]),
    :global(.practice-filter-group [data-slot="toggle-group-item"]) {
      min-height: 42px;
      padding-inline: 0;
    }

    :global(.practice-order-grid [data-slot="toggle-group-item"] span),
    :global(.practice-filter-group [data-slot="toggle-group-item"] span) {
      display: none;
    }

    :global(.practice-filter-group) {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }

  @container (max-width: 620px) {
    .practice-launcher-header {
      display: grid;
    }

    .practice-launcher-stats {
      width: 100%;
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .practice-launcher-stats div:first-child {
      border-left: 0;
      padding-left: 0;
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
    .practice-order-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
