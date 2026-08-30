<script lang="ts">
  import { BookOpenCheck, Network, RefreshCw } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import type { TopicRelationSyncMode } from "@/question-bank/adapters/siyuan";

  type SectionId = "practice" | "index" | "topic";

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
  export let revealSection: (id: SectionId) => void;

  const icons = {
    practice: BookOpenCheck,
    index: RefreshCw,
    topic: Network,
  } as const;

  let active: SectionId = "practice";

  $: sections = [
    {
      id: "practice" as const,
      name: label("quickBarPractice", "Practice"),
      metrics: [
        `${questionCount} ${label("questions", "questions")}`,
        `${untouchedQuestions} ${label("untouched", "untouched")}`,
        `${wrongQuestions} ${label("wrong", "wrong")}`,
      ].join(" · "),
      actionLabel: label("quickBarStartPractice", "Start practice"),
      actionDisabled: busy || !canStartPractice,
      run: startPractice,
      badge: untouchedQuestions,
      tone: "pending" as const,
    },
    {
      id: "index" as const,
      name: label("quickBarIndex", "Index"),
      metrics: blockers > 0
        ? label("quickBarBlocked", "Blocked")
        : pendingSync
          ? `${indexChanges} ${label("quickBarChanges", "changes")}`
          : label("quickBarIndexUpToDate", "Up to date"),
      actionLabel: pendingSync ? label("quickBarConfirmSync", "Sync index") : label("quickBarIndexUpToDate", "Up to date"),
      actionDisabled: busy || !pendingSync || blockers > 0,
      run: confirmSync,
      badge: blockers > 0 ? blockers : indexChanges,
      tone: blockers > 0 ? ("danger" as const) : ("pending" as const),
    },
    {
      id: "topic" as const,
      name: label("quickBarTopic", "Topics"),
      metrics: topicRelationMode === "off"
        ? label("quickBarTopicOff", "Sync off")
        : !topicRelationReady
          ? label("quickBarNotReady", "Not ready")
          : topicPendingChanges > 0
            ? `${topicPendingChanges} ${label("quickBarPendingRelations", "pending")}`
            : `${topicAssignmentCount} ${label("quickBarLinkedTopics", "linked")}`,
      actionLabel: topicPendingChanges > 0
        ? label("quickBarConfirmTopicSync", "Confirm sync")
        : label("quickBarPreviewTopicSync", "Preview relations"),
      actionDisabled: busy || topicRelationMode === "off" || !topicRelationReady,
      run: topicPendingChanges > 0 ? confirmTopicRelations : previewTopicRelations,
      badge: topicPendingChanges > 0 ? topicPendingChanges : topicAssignmentCount,
      tone: "pending" as const,
    },
  ];

  $: current = sections.find((section) => section.id === active) ?? sections[0];

  function select(id: SectionId): void {
    if (active === id) {
      revealSection(id);
      return;
    }
    active = id;
  }
</script>

<div class="workspace-quick-bar" aria-label={label("quickBarLabel", "Workspace shortcuts")}>
  <div class="quick-bar-preview">
    <span class="quick-bar-preview-icon">
      <svelte:component this={icons[current.id]} size={15} aria-hidden="true" />
    </span>
    <span class="quick-bar-preview-copy">
      <strong>{current.name}</strong>
      <small>{current.metrics}</small>
    </span>
    <Button size="sm" disabled={current.actionDisabled} onclick={current.run}>{current.actionLabel}</Button>
  </div>

  <div class="quick-bar-tabs">
    {#each sections as section (section.id)}
      <button
        type="button"
        class="quick-bar-tab"
        class:active={active === section.id}
        aria-pressed={active === section.id}
        title={section.name}
        onclick={() => select(section.id)}
      >
        <svelte:component this={icons[section.id]} size={14} aria-hidden="true" />
        <span>{section.name}</span>
        {#if section.badge > 0}<em class={`tone-${section.tone}`}>{section.badge}</em>{/if}
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

    .quick-bar-preview { min-height: 34px; display: flex; align-items: center; gap: 9px; }

    .quick-bar-preview-icon {
      width: 28px;
      height: 28px;
      flex: 0 0 28px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      color: var(--b3-theme-primary);
      background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
    }

    .quick-bar-preview-copy { min-width: 0; flex: 1 1 auto; display: grid; gap: 1px; }
    .quick-bar-preview-copy strong { font-size: 12.5px; line-height: 1.3; }
    .quick-bar-preview-copy small { overflow: hidden; color: var(--b3-theme-on-surface); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }

    .quick-bar-preview :global(button) {
      flex: 0 0 auto;
      min-height: 34px;
      padding-inline: 12px;
      border-radius: 9px;
      font-size: 12px;
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
    }

    .quick-bar-tab > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .quick-bar-tab.active { color: var(--b3-theme-primary); background: color-mix(in srgb, var(--b3-theme-primary) 14%, transparent); font-weight: 600; }

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
  }
</style>
