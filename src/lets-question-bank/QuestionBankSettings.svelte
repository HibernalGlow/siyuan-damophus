<script lang="ts" module>
  import type { SourceAnswerMaskSettingsLabels } from "./SourceAnswerMaskSettings.svelte";

  export interface QuestionBankSettingsLabels {
    navigation: string;
    practice: string;
    practiceDescription: string;
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
  import { BookOpenCheck, Database, EyeOff, FileText, GraduationCap, Heading1, ListTree, Monitor, PanelsTopLeft, Rows3, TextSelect, Timer } from "lucide-svelte";
  import SettingPanel from "@/libs/setting-panel.svelte";
  import { Button } from "@/components/ui/button";
  import * as Select from "@/components/ui/select";
  import { plugin } from "@/utils";
  import QuestionBankPanel from "./QuestionBankPanel.svelte";
  import SourceAnswerMaskSettings from "./SourceAnswerMaskSettings.svelte";
  import type { AnswerMaskStyle } from "./source-answer-mask";

  export let group: string;
  export let title: string;
  export let settingItems: ISettingItem[] = [];
  export let labels: QuestionBankSettingsLabelsBundle;

  const sectionIds = ["practice", "review", "index", "display", "timing", "mask"] as const;
  type SectionId = typeof sectionIds[number];
  type StandardSectionId = Exclude<SectionId, "mask">;
  const displaySelectSettingKeys = new Set(["questionRenderMode", "embedHeadingMode"]);

  const sectionKeys: Record<StandardSectionId, string[]> = {
    practice: ["defaultQuestionOrder", "defaultOptionOrder", "defaultPracticeFilter"],
    review: [
      "reviewThreshold",
      "autoAddQuickCards",
      "autoCardHardThreshold",
      "autoCardAgainThreshold",
    ],
    index: ["autoSyncIndex", "maintainIndex", "migrateTopicRelations", "autoScanDocument"],
    display: [
      "showPracticeTitle",
      "showPracticeBreadcrumb",
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
    { id: "practice" as const, Icon: BookOpenCheck, label: labels.sections.practice, description: labels.sections.practiceDescription },
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

  function standardItemsFor(sectionId: StandardSectionId): ISettingItem[] {
    return itemsFor(sectionId).filter((item) => !displaySelectSettingKeys.has(item.key));
  }

  function displaySelectItems(): ISettingItem[] {
    return itemsFor("display").filter((item) => displaySelectSettingKeys.has(item.key));
  }

  function localized(value: string): string {
    return plugin.i18n[value] || value;
  }

  function setDisplaySelectChoice(item: ISettingItem, value: string): void {
    if (!value || value === item.value) return;
    dispatch("changed", { group, key: item.key, value });
  }

  function displaySelectIcon(key: string, value: string) {
    if (key === "questionRenderMode") {
      if (value === "html") return TextSelect;
      if (value === "native") return FileText;
      return PanelsTopLeft;
    }
    if (value === "0") return Rows3;
    if (value === "1") return Heading1;
    return ListTree;
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
        <Button
          variant="ghost"
          class={activeSection === section.id ? "active" : ""}
          title={section.label}
          aria-label={section.label}
          aria-current={activeSection === section.id ? "location" : undefined}
          aria-controls={`question-bank-settings-section-${section.id}`}
          data-settings-section-target={section.id}
          onclick={() => jumpToSection(section.id)}
        >
          <svelte:component this={section.Icon} aria-hidden="true" />
          <span class="question-bank-settings-navigation-label">{section.label}</span>
        </Button>
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
                settingItems={standardItemsFor(section.id)}
                on:changed={(event) => dispatch("changed", event.detail)}
                on:click={(event) => dispatch("click", event.detail)}
                on:preview={(event) => dispatch("preview", event.detail)}
              />
              {#if section.id === "display"}
                <div class="question-bank-display-selects">
                  {#each displaySelectItems() as item (item.key)}
                    <div class="question-bank-display-select" data-settings-display-select={item.key}>
                      <div class="min-w-0">
                        <div class="text-sm font-medium">{@html localized(item.title)}</div>
                        <div class="mt-1 text-xs leading-5 text-muted-foreground">{@html localized(item.description)}</div>
                      </div>
                      <Select.Root
                        type="single"
                        value={String(item.value)}
                        onValueChange={(value) => setDisplaySelectChoice(item, value)}
                      >
                        {@const selectedValue = String(item.value)}
                        {@const selectedLabel = localized(item.options[selectedValue] || selectedValue)}
                        {@const SelectedIcon = displaySelectIcon(item.key, selectedValue)}
                        <Select.Trigger id={item.key} class="w-52 max-w-full" title={selectedLabel} aria-label={localized(item.title)}>
                          <svelte:component this={SelectedIcon} aria-hidden="true" />
                          <span>{selectedLabel}</span>
                        </Select.Trigger>
                        <Select.Content>
                          <Select.Group>
                            {#each Object.entries(item.options) as [value, option] (value)}
                              {@const label = localized(option)}
                              {@const Icon = displaySelectIcon(item.key, value)}
                              <Select.Item {value} {label}>
                                <svelte:component this={Icon} aria-hidden="true" />
                                <span>{label}</span>
                              </Select.Item>
                            {/each}
                          </Select.Group>
                        </Select.Content>
                      </Select.Root>
                    </div>
                  {/each}
                </div>
              {/if}
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

  .question-bank-settings-navigation :global([data-slot="button"]) {
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

  .question-bank-settings-navigation :global([data-slot="button"] svg) {
    width: 15px;
    height: 15px;
    flex: 0 0 15px;
  }

  .question-bank-settings-navigation :global([data-slot="button"]:hover) {
    background: var(--b3-list-hover);
    color: var(--b3-theme-on-background);
  }

  .question-bank-settings-navigation :global([data-slot="button"]:focus-visible) {
    outline: 2px solid var(--b3-theme-primary);
    outline-offset: 1px;
  }

  .question-bank-settings-navigation :global([data-slot="button"].active) {
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

  .question-bank-display-selects {
    border-top: 1px solid var(--b3-border-color);
  }

  .question-bank-display-select {
    display: grid;
    min-height: 64px;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 20px;
    border-bottom: 1px solid var(--b3-border-color);
    padding: 12px;
  }

  .question-bank-display-select :global([data-slot="select-trigger"] > span) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @container (max-width: 520px) {
    .question-bank-display-select {
      grid-template-columns: 1fr;
      gap: 12px;
    }
  }

  @container (max-width: 680px) {
    .question-bank-settings-navigation :global([data-slot="button"]) {
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
