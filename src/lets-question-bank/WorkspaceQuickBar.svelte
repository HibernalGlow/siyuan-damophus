<script lang="ts">
  import { BookOpenCheck, Check, Clock3, Layers3, Network, RefreshCw } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import type { TopicRelationSyncMode } from "@/question-bank/adapters/siyuan";

  type SectionId = "practice" | "index" | "topic";
  type AnswerMode = "practice" | "composer" | "exam";

  export let label: (key: string, fallback: string) => string;
  export let busy = false;
  export let questionCount = 0;
  export let untouchedQuestions = 0;
  export let wrongQuestions = 0;
  export let canStartPractice = false;
  export let startPractice: () => void;
  export let indexChanges = 0;
  export let blockers = 0;
  export let pendingSync = false;
  export let confirmSync: () => void;
  export let topicAssignmentCount = 0;
  export let topicRelationMode: "off" | TopicRelationSyncMode = "off";
  export let topicPendingChanges = 0;
  export let topicRelationReady = false;
  export let previewTopicRelations: () => void;
  export let confirmTopicRelations: () => void;
  export let activeView: SectionId = "practice";
  export let onViewChange: (id: SectionId) => void;
  export let revealSection: (id: SectionId) => void;
  export let mode: AnswerMode = "practice";
  export let selectMode: (mode: AnswerMode) => void;

  const icons = {
    practice: BookOpenCheck,
    index: RefreshCw,
    topic: Network,
  } as const;

  let modeMenuOpen = false;
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let consumedByLongPress = false;

  $: modeOptions = [
    { id: "practice" as const, icon: BookOpenCheck, name: label("quickPractice", "快速练习") },
    { id: "composer" as const, icon: Layers3, name: label("questionSet", "跨文档组卷") },
    { id: "exam" as const, icon: Clock3, name: label("mockExam", "模拟考试") },
  ];

  $: currentMode = modeOptions.find((option) => option.id === mode) ?? modeOptions[0];

  $: sections = [
    {
      id: "practice" as const,
      name: currentMode.name,
      tabName: label("quickBarPractice", "练习"),
      metrics: mode === "composer"
        ? label("quickBarComposerHint", "跨文档挑题组卷")
        : mode === "exam"
          ? label("quickBarExamHint", "限时整套作答")
          : [
              `${questionCount} ${label("questions", "questions")}`,
              `${untouchedQuestions} ${label("untouched", "untouched")}`,
              `${wrongQuestions} ${label("wrong", "wrong")}`,
            ].join(" · "),
      actionLabel: mode === "practice" ? label("quickBarStartPractice", "开始") : label("quickBarBackToPractice", "返回"),
      actionDisabled: mode === "practice" ? busy || !canStartPractice : busy,
      run: mode === "practice" ? startPractice : () => selectMode("practice"),
      badge: mode === "practice" ? untouchedQuestions : 0,
      tone: "pending" as const,
    },
    {
      id: "index" as const,
      name: label("quickBarIndex", "索引"),
      tabName: label("quickBarIndex", "索引"),
      metrics: blockers > 0
        ? label("quickBarBlocked", "存在阻断")
        : pendingSync
          ? `${indexChanges} ${label("quickBarChanges", "项变更")}`
          : label("quickBarIndexUpToDate", "已是最新"),
      actionLabel: pendingSync ? label("quickBarConfirmSync", "同步") : label("quickBarIndexUpToDate", "已是最新"),
      actionDisabled: busy || !pendingSync || blockers > 0,
      run: confirmSync,
      badge: blockers > 0 ? blockers : indexChanges,
      tone: blockers > 0 ? ("danger" as const) : ("pending" as const),
    },
    {
      id: "topic" as const,
      name: label("quickBarTopic", "考点"),
      tabName: label("quickBarTopic", "考点"),
      metrics: topicRelationMode === "off"
        ? label("quickBarTopicOff", "未开启同步")
        : !topicRelationReady
          ? label("quickBarNotReady", "尚未就绪")
          : topicPendingChanges > 0
            ? `${topicPendingChanges} ${label("quickBarPendingRelations", "项待同步")}`
            : `${topicAssignmentCount} ${label("quickBarLinkedTopics", "个已关联")}`,
      actionLabel: topicPendingChanges > 0 ? label("quickBarConfirmTopicSync", "确认") : label("quickBarPreviewTopicSync", "预览"),
      actionDisabled: busy || topicRelationMode === "off" || !topicRelationReady,
      run: topicPendingChanges > 0 ? confirmTopicRelations : previewTopicRelations,
      badge: topicPendingChanges > 0 ? topicPendingChanges : topicAssignmentCount,
      tone: "pending" as const,
    },
  ];

  // The bar is a view switcher, so its preview row shows the OTHER two cards: the
  // active card is already on screen, only the hidden ones need a summary here.
  $: peeks = sections.filter((section) => section.id !== activeView);

  function select(id: SectionId): void {
    if (consumedByLongPress) {
      consumedByLongPress = false;
      return;
    }
    modeMenuOpen = false;
    if (activeView === id) {
      revealSection(id);
      return;
    }
    onViewChange(id);
  }

  function startPress(id: SectionId): void {
    if (id !== "practice") return;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      consumedByLongPress = true;
      modeMenuOpen = true;
    }, 420);
  }

  function endPress(): void {
    clearTimeout(pressTimer);
  }

  function pickMode(id: AnswerMode): void {
    modeMenuOpen = false;
    if (id !== mode) selectMode(id);
  }
</script>

<div class="workspace-quick-bar" aria-label={label("quickBarLabel", "Workspace shortcuts")}>
  {#if modeMenuOpen}
    <div class="quick-bar-mode-menu" role="menu" aria-label={label("practiceModes", "答题模式")}>
      {#each modeOptions as option (option.id)}
        <button type="button" role="menuitem" class:checked={mode === option.id} onclick={() => pickMode(option.id)}>
          <svelte:component this={option.icon} size={15} aria-hidden="true" />
          <span>{option.name}</span>
          {#if mode === option.id}<Check size={14} aria-hidden="true" />{/if}
        </button>
      {/each}
    </div>
  {/if}

  <div class="quick-bar-peek">
    {#each peeks as peek (peek.id)}
      <div class="peek-card">
        <span class="peek-icon" aria-hidden="true">
          <svelte:component this={icons[peek.id]} size={13} />
        </span>
        <span class="peek-copy">
          <strong>{peek.name}</strong>
          <small>{peek.metrics}</small>
        </span>
        <Button size="sm" variant="outline" disabled={peek.actionDisabled} onclick={peek.run}>{peek.actionLabel}</Button>
      </div>
    {/each}
  </div>

  <div class="quick-bar-tabs">
    {#each sections as section (section.id)}
      <button
        type="button"
        class="quick-bar-tab"
        class:active={activeView === section.id}
        aria-pressed={activeView === section.id}
        title={section.tabName}
        onpointerdown={() => startPress(section.id)}
        onpointerup={endPress}
        onpointerleave={endPress}
        onpointercancel={endPress}
        oncontextmenu={(event) => {
          if (section.id !== "practice") return;
          event.preventDefault();
          modeMenuOpen = true;
        }}
        onclick={() => select(section.id)}
      >
        <svelte:component this={icons[section.id]} size={14} aria-hidden="true" />
        <span>{section.tabName}</span>
        {#if section.badge > 0}<em class={`tone-${section.tone}`}>{section.badge}</em>{/if}
        {#if section.id === "practice"}<i class="tab-more" aria-hidden="true"></i>{/if}
      </button>
    {/each}
  </div>
</div>

<style>
  /* Desktop keeps the full inline layout, so the floating shortcut bar is mobile-only. */
  .workspace-quick-bar { display: none; }

  @container (max-width: 760px) {
    .workspace-quick-bar {
      position: sticky;
      bottom: 0;
      z-index: 3;
      margin: 10px -14px 0;
      padding: 7px 10px calc(7px + env(safe-area-inset-bottom, 0px));
      border-top: 1px solid var(--b3-border-color);
      background: color-mix(in srgb, var(--b3-theme-background) 93%, transparent);
      backdrop-filter: blur(14px);
      display: grid;
      gap: 6px;
    }

    .quick-bar-peek { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }

    .peek-card {
      min-width: 0;
      min-height: 42px;
      padding: 5px 7px;
      display: flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--b3-border-color);
      border-radius: 11px;
      background: var(--b3-theme-surface);
    }

    .peek-icon {
      width: 22px;
      height: 22px;
      flex: 0 0 22px;
      border-radius: 7px;
      display: grid;
      place-items: center;
      color: var(--b3-theme-primary);
      background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
    }

    .peek-copy { min-width: 0; flex: 1 1 auto; display: grid; gap: 0; }
    .peek-copy strong { font-size: 11.5px; line-height: 1.35; }
    .peek-copy small { overflow: hidden; color: var(--b3-theme-on-surface); font-size: 10.5px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }

    .peek-card :global(button) {
      flex: 0 0 auto;
      min-height: 28px;
      max-width: 62px;
      padding-inline: 8px;
      border-radius: 8px;
      font-size: 11px;
    }

    .quick-bar-tabs {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 2px;
      padding: 3px;
      border: 1px solid var(--b3-border-color);
      border-radius: 12px;
      background: var(--b3-theme-surface);
    }

    .quick-bar-tab {
      position: relative;
      min-height: 36px;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      border: 0;
      border-radius: 9px;
      background: transparent;
      color: var(--b3-theme-on-surface);
      font-size: 12px;
      cursor: pointer;
      -webkit-touch-callout: none;
      user-select: none;
    }

    .quick-bar-tab > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .quick-bar-tab.active { color: var(--b3-theme-primary); background: color-mix(in srgb, var(--b3-theme-primary) 14%, transparent); font-weight: 600; }

    /* Tiny marker: the practice tab opens the answer-mode menu on long press. */
    .tab-more {
      position: absolute;
      top: 5px;
      right: 6px;
      width: 3px;
      height: 3px;
      border-radius: 50%;
      background: currentColor;
      opacity: 0.5;
    }

    .quick-bar-tab em {
      min-width: 17px;
      height: 17px;
      flex: 0 0 auto;
      padding-inline: 4px;
      border-radius: 999px;
      display: inline-grid;
      place-items: center;
      background: var(--b3-border-color);
      color: var(--b3-theme-on-surface);
      font-size: 10px;
      font-style: normal;
      font-variant-numeric: tabular-nums;
    }

    .quick-bar-tab em.tone-pending { background: color-mix(in srgb, var(--b3-theme-primary) 18%, transparent); color: var(--b3-theme-primary); }
    .quick-bar-tab em.tone-danger { background: color-mix(in srgb, var(--b3-theme-error) 20%, transparent); color: var(--b3-theme-error); }

    .quick-bar-mode-menu {
      position: absolute;
      right: 10px;
      bottom: calc(100% - 4px);
      z-index: 4;
      min-width: 172px;
      padding: 4px;
      border: 1px solid var(--b3-border-color);
      border-radius: 13px;
      background: var(--b3-theme-background);
      box-shadow: 0 14px 34px rgb(0 0 0 / 20%);
      display: grid;
      gap: 1px;
    }

    .quick-bar-mode-menu button {
      min-height: 40px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding-inline: 10px;
      border: 0;
      border-radius: 9px;
      background: transparent;
      color: var(--b3-theme-on-background);
      font-size: 12.5px;
      text-align: left;
      cursor: pointer;
    }

    .quick-bar-mode-menu button span { flex: 1 1 auto; }
    .quick-bar-mode-menu button.checked { color: var(--b3-theme-primary); background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent); font-weight: 600; }
    .quick-bar-mode-menu button:hover { background: var(--b3-list-hover); }
  }
</style>
