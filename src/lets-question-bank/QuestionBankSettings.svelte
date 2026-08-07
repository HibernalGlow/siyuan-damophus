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
  import { createEventDispatcher } from "svelte";
  import { Database, EyeOff, GraduationCap, Monitor, Timer } from "lucide-svelte";
  import SettingPanel from "@/libs/setting-panel.svelte";
  import QuestionBankPanel from "./QuestionBankPanel.svelte";
  import SourceAnswerMaskSettings from "./SourceAnswerMaskSettings.svelte";
  import type { AnswerMaskStyle } from "./source-answer-mask";

  export let group: string;
  export let settingItems: ISettingItem[] = [];
  export let labels: QuestionBankSettingsLabelsBundle;

  type SectionId = "review" | "index" | "display" | "timing" | "mask";
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
  let activeSection: SectionId | null = null;

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
    if (open) activeSection = sectionId;
    else if (activeSection === sectionId) activeSection = null;
  }
</script>

<section class="question-bank-settings min-w-0" aria-label={labels.sections.navigation}>
  {#each sections as section (section.id)}
    <QuestionBankPanel
      open={activeSection === section.id}
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
  {/each}
</section>

<style>
  .question-bank-settings-panel-content {
    padding: 0 14px 14px;
  }

  .question-bank-settings-panel-content :global(section) {
    border-top: 0;
    border-bottom: 0;
  }

  @media (max-width: 640px) {
    .question-bank-settings-panel-content {
      padding: 0 10px 10px;
    }
  }
</style>
