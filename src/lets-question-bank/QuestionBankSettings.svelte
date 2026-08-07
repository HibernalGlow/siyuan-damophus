<script lang="ts" module>
  import type { SourceAnswerMaskSettingsLabels } from "./SourceAnswerMaskSettings.svelte";

  export interface QuestionBankSettingsLabels {
    navigation: string;
    review: string;
    reviewDescription: string;
    index: string;
    indexDescription: string;
    display: string;
    displayDescription: string;
    timing: string;
    timingDescription: string;
    mask: string;
  }

  export interface QuestionBankSettingsLabelsBundle {
    sections: QuestionBankSettingsLabels;
    mask: SourceAnswerMaskSettingsLabels;
  }
</script>

<script lang="ts">
  import { createEventDispatcher, tick } from "svelte";
  import { Database, EyeOff, GraduationCap, Monitor, Timer } from "lucide-svelte";
  import SettingPanel from "@/libs/setting-panel.svelte";
  import QuestionBankPanel from "./QuestionBankPanel.svelte";
  import SourceAnswerMaskSettings from "./SourceAnswerMaskSettings.svelte";
  import type { AnswerMaskStyle } from "./source-answer-mask";

  export let group: string;
  export let title: string;
  export let settingItems: ISettingItem[] = [];
  export let labels: QuestionBankSettingsLabelsBundle;

  const sectionIds = ["review", "index", "display", "timing", "mask"] as const;
  type SectionId = typeof sectionIds[number];
  type StandardSectionId = Exclude<SectionId, "mask">;

  const sectionKeys: Record<StandardSectionId, string[]> = {
    review: [
      "reviewThreshold",
      "autoAddQuickCards",
      "autoCardHardThreshold",
      "autoCardAgainThreshold",
    ],
    index: ["autoSyncIndex", "maintainIndex", "autoScanDocument"],
    display: [
      "showPracticeTitle",
      "hideEmptyAnswerBlocks",
      "inheritSourceStyles",
      "questionRenderMode",
      "embedBreadcrumb",
      "embedHeadingMode",
    ],
    timing: ["timingEnabled", "pauseOnAnswerReveal", "durationComparisonPosition"],
  };

  const dispatch = createEventDispatcher();
  let activeSection: SectionId = "review";
  let openSections = new Set<SectionId>(sectionIds);

  $: sections = [
    { id: "review" as const, Icon: GraduationCap, label: labels.sections.review, description: labels.sections.reviewDescription },
    { id: "index" as const, Icon: Database, label: labels.sections.index, description: labels.sections.indexDescription },
    { id: "display" as const, Icon: Monitor, label: labels.sections.display, description: labels.sections.displayDescription },
    { id: "timing" as const, Icon: Timer, label: labels.sections.timing, description: labels.sections.timingDescription },
    { id: "mask" as const, Icon: EyeOff, label: labels.sections.mask, description: labels.mask.description },
  ];
  $: maskEnabled = Boolean(settingItems.find((item) => item.key === "maskSourceAnswers")?.value);
  $: maskStyle = (settingItems.find((item) => item.key === "answerMaskStyle")?.value ?? "blur") as AnswerMaskStyle;

  function itemsFor(sectionId: StandardSectionId): ISettingItem[] {
    return settingItems.filter((item) => sectionKeys[sectionId].includes(item.key));
  }

  function setSectionOpen(sectionId: SectionId, open: boolean): void {
    const nextOpenSections = new Set(openSections);
    if (open) {
      nextOpenSections.add(sectionId);
      activeSection = sectionId;
    } else {
      nextOpenSections.delete(sectionId);
    }
    openSections = nextOpenSections;
  }

  async function jumpToSection(sectionId: SectionId): Promise<void> {
    activeSection = sectionId;
    if (!openSections.has(sectionId)) {
      openSections = new Set(openSections).add(sectionId);
      await tick();
    }
    document.getElementById(`question-bank-settings-section-${sectionId}`)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }
</script>

<section class="question-bank-settings min-w-0" aria-label={title}>
  <header class="question-bank-settings-header">
    <div class="question-bank-settings-title" role="heading" aria-level="2">{title}</div>
    <nav class="question-bank-settings-navigation" aria-label={labels.sections.navigation}>
      {#each sections as section (section.id)}
        <button
          type="button"
          class:active={activeSection === section.id}
          title={section.label}
          aria-label={section.label}
          aria-current={activeSection === section.id ? "location" : undefined}
          aria-controls={`question-bank-settings-section-${section.id}`}
          data-settings-section-target={section.id}
          onclick={() => jumpToSection(section.id)}
        >
          <svelte:component this={section.Icon} aria-hidden="true" />
          <span class="question-bank-settings-navigation-label">{section.label}</span>
        </button>
      {/each}
    </nav>
  </header>

  <div class="question-bank-settings-list">
    {#each sections as section (section.id)}
      <div
        id={`question-bank-settings-section-${section.id}`}
        class="question-bank-settings-section"
        data-settings-section={section.id}
      >
        <QuestionBankPanel
          open={openSections.has(section.id)}
          Icon={section.Icon}
          title={section.label}
          description={section.description}
          contentId={`question-bank-settings-${section.id}`}
          on:openChange={(event) => setSectionOpen(section.id, event.detail)}
        >
          <div class="question-bank-settings-panel-content">
            {#if section.id === "mask"}
              <SourceAnswerMaskSettings
                enabled={maskEnabled}
                style={maskStyle}
                labels={labels.mask}
                showHeading={false}
                on:changed={(event) => dispatch("changed", { group, ...event.detail })}
                on:preview={(event) => dispatch("preview", { group, ...event.detail })}
              />
            {:else}
              <SettingPanel
                {group}
                settingItems={itemsFor(section.id)}
                on:changed={(event) => dispatch("changed", event.detail)}
                on:click={(event) => dispatch("click", event.detail)}
                on:preview={(event) => dispatch("preview", event.detail)}
              />
            {/if}
          </div>
        </QuestionBankPanel>
      </div>
    {/each}
  </div>
</section>

<style>
  .question-bank-settings {
    container-type: inline-size;
  }

  .question-bank-settings-header {
    position: sticky;
    top: 0;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--b3-border-color);
    background: color-mix(in srgb, var(--b3-theme-background) 94%, transparent);
    backdrop-filter: blur(12px);
  }

  .question-bank-settings-title {
    flex: 0 0 auto;
    font-size: 18px;
    font-weight: 600;
  }

  .question-bank-settings-navigation {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 4px;
  }

  .question-bank-settings-navigation button {
    display: inline-flex;
    min-height: 30px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 4px 9px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--b3-theme-on-surface);
    font-size: 12px;
    cursor: pointer;
  }

  .question-bank-settings-navigation button :global(svg) {
    width: 15px;
    height: 15px;
    flex: 0 0 15px;
  }

  .question-bank-settings-navigation button:hover {
    background: var(--b3-list-hover);
    color: var(--b3-theme-on-background);
  }

  .question-bank-settings-navigation button:focus-visible {
    outline: 2px solid var(--b3-theme-primary);
    outline-offset: 1px;
  }

  .question-bank-settings-navigation button.active {
    border-color: color-mix(in srgb, var(--b3-theme-primary) 32%, transparent);
    background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
    color: var(--b3-theme-primary);
    font-weight: 600;
  }

  .question-bank-settings-list {
    padding-top: 4px;
  }

  .question-bank-settings-section {
    scroll-margin-top: 72px;
  }

  .question-bank-settings-panel-content {
    padding: 0 14px 14px;
  }

  .question-bank-settings-panel-content :global(section) {
    border-top: 0;
    border-bottom: 0;
  }

  @container (max-width: 680px) {
    .question-bank-settings-navigation button {
      width: 32px;
      padding: 4px;
    }

    .question-bank-settings-navigation-label {
      display: none;
    }
  }

  @media (max-width: 640px) {
    .question-bank-settings-panel-content {
      padding: 0 10px 10px;
    }
  }
</style>
