<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { Info } from "lucide-svelte";
  import { showMessage } from "siyuan";
  import { Button } from "@/components/ui/button";
  import EntryManagementSettings from "@/components/entry-management-settings.svelte";
  import SwitchSettings from "@/components/switch-settings.svelte";
  import { enableLogging } from "@/libs/logger";
  import { buildModuleSettings, MODULE_ENABLED_SETTING_KEY } from "@/libs/module-settings";
  import { resolveEntrySetting } from "@/libs/plugin-entry-settings";
  import { resolvePluginIconName, settingGroupIcons, type PluginIconName } from "@/libs/plugin-icons";
  import { buildSettingCategoryGroups } from "@/libs/setting-categories";
  import {
    applyNavOrder,
    parseSettingsNavState,
    SETTINGS_NAV_STATE_KEY,
    type SettingsNavState,
  } from "@/libs/settings-nav-state";
  import { settings } from "@/settings";
  import { getHostColorMode, observeHostColorMode } from "@/theme/runtime";
  import { parseStoredThemes } from "@/theme/schema";
  import { DEFAULT_THEME_ID, findTheme } from "@/theme/themes";
  import SettingPanel from "./libs/setting-panel.svelte";
  import BlockAttributeSettings from "./lets-block-attr/BlockAttributeSettings.svelte";
  import QuestionBankSettings from "./lets-question-bank/QuestionBankSettings.svelte";
  import LayoutActionsSettings from "./lets-layout-actions/LayoutActionsSettings.svelte";
  import CalloutAppearanceSettings from "./lets-callout-appearance/CalloutAppearanceSettings.svelte";
  import {
    DEFAULT_CUSTOM_PROPERTIES,
    DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
    DEFAULT_CUSTOM_PROPERTY_STYLE,
  } from "./lets-block-attr/custom-properties";
  import { PluginRegistry } from "./plugin-registry";
  import { isMobile, plugin } from "./utils";
  import SettingOverview from "./components/setting-overview.svelte";

  const SWITCH_GROUP = "开关";
  const ENTRY_GROUP = "入口";
  const GENERAL_GROUP = "设置";
  const BLOCK_ATTRIBUTE_PLUGIN = "quickAttr";
  const QUESTION_BANK_PLUGIN = "questionBank";
  const COMPACT_LAYOUT_MAX_WIDTH = 720;
  const LAYOUT_ACTIONS_PLUGIN = "layoutActions";
  const CALLOUT_APPEARANCE_PLUGIN = "calloutAppearance";

  interface ChangeEvent {
    group: string;
    key: string;
    value: any;
  }

  function initData() {
    const pluginConfigs = PluginRegistry.getInstance().getPluginConfigs();
    const dynamicSettings: Record<string, any[]> = {
      [SWITCH_GROUP]: [],
      [GENERAL_GROUP]: [
        {
          type: "checkbox",
          title: "settings.debugLogging",
          description: "settings.debugLoggingDesc",
          key: "debugLogging",
          value: settings.get("debugLogging") || false,
        },
        {
          type: "textinput",
          title: "settings.lastVersion",
          description: "settings.lastVersionDesc",
          key: "lastVersion",
          value: settings.get("lastVersion") || "",
        },
        {
          type: "button",
          title: "settings.mergeData",
          description: "settings.mergeDataDesc",
          key: "mergeData",
          value: "settings.confirm",
        },
        {
          type: "button",
          title: "settings.resetData",
          description: "settings.resetDataDesc",
          key: "resetData",
          value: "settings.confirm",
        },
      ],
    };

    const modules = buildModuleSettings(pluginConfigs, storedPluginSetting);
    dynamicSettings[SWITCH_GROUP] = modules.switches;
    dynamicSettings[ENTRY_GROUP] = modules.entries;
    Object.assign(dynamicSettings, modules.groups);
    return dynamicSettings;
  }

  function storedPluginSetting(pluginName: string, key: string, fallback: unknown) {
    if (key === "entryDesktopDock" || key === "entryMobileDock") {
      const surface = key === "entryDesktopDock" ? "desktopDock" : "mobileDock";
      return resolveEntrySetting(
        (settingKey) => settings.getBySpace(pluginName, settingKey),
        surface,
        Boolean(fallback),
      );
    }
    const stored = settings.getBySpace(pluginName, key);
    if (stored !== undefined && stored !== null) return stored;
    return fallback;
  }

  let settingItems = initData();
  // Damophus' own theme picker is intentionally hidden for now.
  // The settings panel follows SiYuan's active theme instead.
  let focusGroup = SWITCH_GROUP;
  let mode = getHostColorMode();
  let customThemes = parseStoredThemes(settings.get("customThemes"));
  const storedThemeId = settings.get("uiThemeId");
  let savedThemeId = typeof storedThemeId === "string" ? storedThemeId : DEFAULT_THEME_ID;
  let selectedThemeId = savedThemeId;
  let settingRoot: HTMLDivElement;
  let compactLayout = isMobile;
  let navState: SettingsNavState = parseSettingsNavState(settings.get(SETTINGS_NAV_STATE_KEY));
  let view: "overview" | "detail" = "overview";

  $: groups = [
    SWITCH_GROUP,
    ENTRY_GROUP,
    GENERAL_GROUP,
    ...settingItems[SWITCH_GROUP]
      .map((item) => item.title),
  ];
  $: settingCategories = applyNavOrder(buildSettingCategoryGroups(settingItems[SWITCH_GROUP], [
    SWITCH_GROUP,
    ENTRY_GROUP,
    GENERAL_GROUP,
  ]), navState);
  $: switchCategories = settingCategories.filter((category) => category.id !== "core");
  $: showOverview = view === "overview" && settingCategories.length > 0;
  $: overviewCategories = settingCategories.map((category) => ({
    id: category.id,
    label: t(category.label, category.label),
    description: t(category.description, category.description),
    icon: category.icon,
    enabled: category.id === "core"
      ? undefined
      : category.groups.filter((pluginName) => Boolean(settingItems[SWITCH_GROUP].find((item) => item.key === pluginName)?.value)).length,
    total: category.id === "core" ? undefined : category.groups.length,
    modules: category.id === "core"
      ? category.groups.map((group) => ({
        id: group,
        selectId: group,
        label: getGroupLabel(group),
        icon: getGroupIcon(group, 0),
        enabled: undefined,
      }))
      : category.groups.map((pluginName) => {
        const item = settingItems[SWITCH_GROUP].find((entry) => entry.key === pluginName);
        const title = item?.title ?? pluginName;
        return {
          id: pluginName,
          selectId: title,
          label: getGroupLabel(title),
          icon: getGroupIcon(title, 0),
          enabled: Boolean(item?.value),
        };
      }),
  }));
  $: selectedTheme = findTheme(selectedThemeId, customThemes);
  $: focusedPlugin = PluginRegistry.getInstance().getPluginConfigs().find(
    (item) => item.displayName === focusGroup || item.name === focusGroup,
  );
  $: showBlockAttributeSettings = focusedPlugin?.name === BLOCK_ATTRIBUTE_PLUGIN;
  $: showQuestionBankSettings = focusedPlugin?.name === QUESTION_BANK_PLUGIN;
  $: showLayoutActionsSettings = focusedPlugin?.name === LAYOUT_ACTIONS_PLUGIN;
  $: showCalloutAppearanceSettings = focusedPlugin?.name === CALLOUT_APPEARANCE_PLUGIN;
  $: showEntryManagement = focusGroup === ENTRY_GROUP;
  $: focusedSettingItems = settingItems[focusGroup] ?? [];
  $: moduleEnabledSettingItems = focusedPlugin
    ? focusedSettingItems.filter((item) => item.key === MODULE_ENABLED_SETTING_KEY)
    : [];
  $: moduleSpecificSettingItems = focusedPlugin
    ? focusedSettingItems.filter((item) => item.key !== MODULE_ENABLED_SETTING_KEY)
    : focusedSettingItems;
  $: layoutActions = settingItems[focusGroup]?.find((item) => item.key === "actions")?.value ?? [];
  $: layoutActionsDockPosition = settingItems[focusGroup]?.find((item) => item.key === "dockPosition")?.value ?? "RightBottom";
  $: if (groups && !groups.includes(focusGroup)) focusGroup = SWITCH_GROUP;

  function t(key: string, fallback: string) {
    return plugin.i18n[key] || fallback;
  }

  function getGroupLabel(groupName: string) {
    const direct = plugin.i18n[`settings.${groupName}`];
    if (direct) return direct;
    const found = PluginRegistry.getInstance().getPluginConfigs().find(
      (item) => item.displayName === groupName || item.name === groupName,
    );
    return found ? plugin.i18n[found.displayName] || found.displayName || found.name : groupName;
  }

  function getGroupIcon(groupName: string, _index: number): PluginIconName {
    if (groupName === SWITCH_GROUP) return settingGroupIcons.switch;
    if (groupName === ENTRY_GROUP) return settingGroupIcons.entry;
    if (groupName === GENERAL_GROUP) return settingGroupIcons.general;
    const found = PluginRegistry.getInstance().getPluginConfigs().find(
      (item) => item.displayName === groupName || item.name === groupName,
    );
    return resolvePluginIconName(found?.name ?? groupName, found?.icon);
  }

  function translateKey(key: string) {
    return plugin.i18n[key] || key;
  }

  function entryManagementLabels() {
    return {
      desktopDock: t("settings.entry.desktopDock", "Desktop sidebar"),
      mobileDock: t("settings.entry.mobileDock", "Mobile Dock"),
      menu: t("settings.entry.menu", "Plugin menu"),
      command: t("settings.entry.command", "Command palette"),
      tab: t("settings.entry.tab", "New tab"),
      disabled: t("settings.entry.moduleDisabled", "Module disabled"),
      unavailable: t("settings.entry.unavailable", "Not provided by this module"),
    };
  }

  function getFocusedSettingValue(key: string, fallback: string) {
    const value = settingItems[focusGroup]?.find((item) => item.key === key)?.value;
    return typeof value === "string" ? value : fallback;
  }

  function updateLocalSetting(group: string, key: string, value: any) {
    const item = settingItems[group]?.find((candidate) => candidate.key === key);
    if (!item) return;
    item.value = value;
    settingItems = { ...settingItems };
  }

  function blockAttributeLabels() {
    return {
      preview: t("lets-block-attr.previewTitle", "Marker preview"),
      previewWidth: t("lets-block-attr.previewWidth", "Preview width"),
      properties: t("lets-block-attr.properties", "Displayed properties"),
      availableProperties: t("lets-block-attr.availableProperties", "Available properties"),
      property: t("lets-block-attr.property", "Property"),
      enabled: t("lets-block-attr.enabled", "Show"),
      showLabel: t("lets-block-attr.showLabel", "Label"),
      label: t("lets-block-attr.label", "Display name"),
      addProperty: t("lets-block-attr.addProperty", "Add property"),
      invalidProperty: t("lets-block-attr.invalidProperty", "Enter a safe displayable custom-* property."),
      blockTypes: t("lets-block-attr.blockTypes", "Block types"),
      blockTypeDocument: t("lets-block-attr.blockTypeDocument", "Document"),
      blockTypeHeading: t("lets-block-attr.blockTypeHeading", "Heading"),
      blockTypeParagraph: t("lets-block-attr.blockTypeParagraph", "Paragraph"),
      blockTypeList: t("lets-block-attr.blockTypeList", "List"),
      blockTypeListItem: t("lets-block-attr.blockTypeListItem", "List item"),
      blockTypeBlockquote: t("lets-block-attr.blockTypeBlockquote", "Blockquote"),
      blockTypeSuperBlock: t("lets-block-attr.blockTypeSuperBlock", "Super block"),
      blockTypeTable: t("lets-block-attr.blockTypeTable", "Table"),
      advanced: t("lets-block-attr.advanced", "Advanced appearance"),
      customCss: t("lets-block-attr.customStyleTitle", "Marker style"),
      customCssDescription: t("lets-block-attr.customStyleDescription", "Only safe appearance declarations are applied."),
    };
  }

  function questionBankMaskLabels() {
    return {
      title: t("lets-question-bank.answerMaskSettings", "Source answer masking"),
      description: t("lets-question-bank.answerMaskSettingsDescription", "Hide answer letters in source-document solution blocks without changing Markdown or IAL."),
      enabled: t("lets-question-bank.maskSourceAnswers", "Hide source answers"),
      style: t("lets-question-bank.answerMaskStyle", "Mask style"),
      preview: t("lets-question-bank.answerMaskPreview", "Preview"),
      answerPrefix: t("lets-question-bank.answerMaskPreviewPrefix", "Answer: "),
      blur: t("lets-question-bank.answerMaskStyleBlur", "Blur"),
      solid: t("lets-question-bank.answerMaskStyleSolid", "Solid cover"),
      underline: t("lets-question-bank.answerMaskStyleUnderline", "Underline cover"),
    };
  }

  function questionBankSettingsLabels() {
    return {
      sections: {
        navigation: t("lets-question-bank.settingsNavigation", "Question Bank setting sections"),
        practice: t("lets-question-bank.settingsPractice", "Practice preferences"),
        practiceDescription: t("lets-question-bank.settingsPracticeDescription", "Choose the defaults used when no previous practice selection is available."),
        review: t("lets-question-bank.settingsReview", "Review & cards"),
        reviewDescription: t("lets-question-bank.settingsReviewDescription", "Decide when questions need review and when quick cards are created."),
        index: t("lets-question-bank.settingsIndex", "Index & scanning"),
        indexDescription: t("lets-question-bank.settingsIndexDescription", "Control source scanning, index synchronization, and maintenance."),
        display: t("lets-question-bank.settingsDisplay", "Practice display"),
        displayDescription: t("lets-question-bank.settingsDisplayDescription", "Choose how questions, answers, and source blocks appear during practice."),
        timing: t("lets-question-bank.settingsTiming", "Timing"),
        timingDescription: t("lets-question-bank.settingsTimingDescription", "Configure answer timing and where comparisons appear."),
        mask: t("lets-question-bank.settingsMask", "Source answer mask"),
      },
      mask: questionBankMaskLabels(),
    };
  }

  function layoutActionsSettingsLabels() {
    return {
      dockPosition: t("lets-layout-actions.dockPosition", "Dock position"),
      actions: t("lets-layout-actions.actions", "Custom actions"),
      addAction: t("lets-layout-actions.addAction", "Add action"),
      enabled: t("lets-layout-actions.enabled", "Enabled"),
      title: t("lets-layout-actions.title", "Title"),
      icon: t("lets-layout-actions.icon", "Icon"),
      kind: t("lets-layout-actions.kind", "Source"),
      command: t("lets-layout-actions.command", "Command"),
      commandId: t("lets-layout-actions.commandId", "Command ID"),
      placement: t("lets-layout-actions.placement", "Show in"),
      system: t("lets-layout-actions.system", "SiYuan system command"),
      plugin: t("lets-layout-actions.plugin", "Plugin command"),
      editor: t("lets-layout-actions.editor", "Editor command"),
      placementMenu: t("lets-layout-actions.placementMenu", "Damophus menu"),
      dock: t("lets-layout-actions.dock", "Dock"),
      both: t("lets-layout-actions.both", "Menu and Dock"),
      leftTop: t("lets-layout-actions.leftTop", "Left top"),
      leftBottom: t("lets-layout-actions.leftBottom", "Left bottom"),
      rightTop: t("lets-layout-actions.rightTop", "Right top"),
      rightBottom: t("lets-layout-actions.rightBottom", "Right bottom"),
      bottomLeft: t("lets-layout-actions.bottomLeft", "Bottom left"),
      bottomRight: t("lets-layout-actions.bottomRight", "Bottom right"),
      unavailable: t("lets-layout-actions.unavailable", "not callable"),
      moveUp: t("lets-layout-actions.moveUp", "Move up"),
      moveDown: t("lets-layout-actions.moveDown", "Move down"),
      remove: t("lets-layout-actions.remove", "Remove"),
    };
  }

  function calloutAppearanceSettingsLabels() {
    return {
      preview: t("lets-callout-appearance.preview", "Preview"),
      previewDescription: t("lets-callout-appearance.previewDescription", "The nested example also checks narrow-width containment."),
      outerTitle: t("lets-callout-appearance.previewOuterTitle", "Important"),
      outerBody: t("lets-callout-appearance.previewOuterBody", "Callouts keep a quiet surface while their type remains easy to scan."),
      nestedTitle: t("lets-callout-appearance.previewNestedTitle", "Tip"),
      nestedBody: t("lets-callout-appearance.previewNestedBody", "Nested callouts stay inside the parent content area."),
    };
  }

  async function onClick({ detail }: CustomEvent<ChangeEvent>) {
    if (detail.group === GENERAL_GROUP && detail.key === "resetData") {
      await settings.resetData();
      settingItems = initData();
      navState = parseSettingsNavState(settings.get(SETTINGS_NAV_STATE_KEY));
      customThemes = parseStoredThemes(settings.get("customThemes"));
      const resetThemeId = settings.get("uiThemeId");
      selectedThemeId = savedThemeId = typeof resetThemeId === "string"
        ? resetThemeId
        : DEFAULT_THEME_ID;
      showMessage(t("settings.resetSuccess", "Configuration reset"));
    } else if (detail.group === GENERAL_GROUP && detail.key === "mergeData") {
      await settings.mergeData();
      settingItems = initData();
      showMessage(t("settings.mergeSuccess", "Configuration merged"));
    }
  }

  async function onChanged({ detail }: CustomEvent<ChangeEvent>) {
    if (detail.group === SWITCH_GROUP) {
      await setModuleEnabled(detail.key, Boolean(detail.value));
      settingItems = initData();
    } else if (detail.group === GENERAL_GROUP) {
      settings.set(detail.key, detail.value);
      if (detail.key === "debugLogging") enableLogging(detail.value);
      updateLocalSetting(detail.group, detail.key, detail.value);
    } else {
      const pluginSetting = settingItems[SWITCH_GROUP].find((item) => item.title === detail.group);
      if (!pluginSetting) return;
      if (detail.key === MODULE_ENABLED_SETTING_KEY) {
        await setModuleEnabled(pluginSetting.key, Boolean(detail.value));
      } else {
        settings.setBySpace(pluginSetting.key, detail.key, detail.value);
        if (pluginSetting.value === true) {
          await PluginRegistry.getInstance().beginPlugin(pluginSetting.key);
        }
      }
      settingItems = initData();
    }
    await settings.save();
  }

  async function onBulkSwitchChanged({ detail }: CustomEvent<{ keys: string[]; value: boolean }>) {
    for (const pluginName of detail.keys) {
      await setModuleEnabled(pluginName, detail.value);
    }
    settingItems = initData();
    await settings.save();
  }

  async function setModuleEnabled(pluginName: string, enabled: boolean) {
    settings.setBySpace(pluginName, MODULE_ENABLED_SETTING_KEY, enabled);
    if (enabled) await PluginRegistry.getInstance().beginPlugin(pluginName);
    else PluginRegistry.getInstance().unloadPlugin(pluginName);
  }

  function onPreview({ detail }: CustomEvent<ChangeEvent>) {
    updateLocalSetting(detail.group, detail.key, detail.value);
  }

  function persistNavState() {
    settings.set(SETTINGS_NAV_STATE_KEY, navState);
    void settings.save();
  }

  function selectFromOverview(group: string) {
    focusGroup = group;
    view = "detail";
  }

  function showOverviewPage() {
    view = "overview";
  }

  async function onOverviewToggle({ detail }: CustomEvent<{ id: string; enabled: boolean }>) {
    await setModuleEnabled(detail.id, detail.enabled);
    settingItems = initData();
    await settings.save();
  }

  function onOverviewReorder({ detail }: CustomEvent<{
    categoryOrder?: string[];
    moduleOrder?: { categoryId: string; order: string[] };
  }>) {
    if (detail.categoryOrder) navState = { ...navState, categoryOrder: detail.categoryOrder };
    if (detail.moduleOrder) {
      navState = {
        ...navState,
        moduleOrder: { ...navState.moduleOrder, [detail.moduleOrder.categoryId]: detail.moduleOrder.order },
      };
    }
    persistNavState();
  }

  function onSwitchesExpandedChanged({ detail }: CustomEvent<Record<string, boolean>>) {
    navState = { ...navState, switchesExpanded: detail };
    persistNavState();
  }

  onMount(() => {
    const stopObservingColorMode = observeHostColorMode((nextMode) => {
      mode = nextMode;
    });
    const updateLayout = () => {
      const nextCompactLayout = isMobile || settingRoot.clientWidth <= COMPACT_LAYOUT_MAX_WIDTH;
      if (nextCompactLayout === compactLayout) return;
      compactLayout = nextCompactLayout;
    };
    const layoutObserver = new ResizeObserver(updateLayout);
    const hostWindow = window as Window & { goBack?: (...args: unknown[]) => unknown };
    const originalGoBack = hostWindow.goBack;
    const compactGoBack = (...args: unknown[]) => {
      if (compactLayout && view === "detail") {
        view = "overview";
        return;
      }
      return originalGoBack?.apply(hostWindow, args);
    };
    updateLayout();
    layoutObserver.observe(settingRoot);
    if (isMobile && originalGoBack) hostWindow.goBack = compactGoBack;
    return () => {
      layoutObserver.disconnect();
      stopObservingColorMode();
      if (hostWindow.goBack === compactGoBack) hostWindow.goBack = originalGoBack;
    };
  });

  onDestroy(async () => {
    await settings.save();
  });
</script>

<div
  bind:this={settingRoot}
  class="damophus-theme-root damophus-question-bank-theme flex h-full min-h-0 overflow-hidden bg-background text-foreground"
  class:flex-col={compactLayout}
  class:damophus-settings-mobile={compactLayout}
  data-color-mode={mode}
>
  <div
    class="settings-stage"
    class:settings-stage--overview={showOverview}
    class:settings-stage--detail={!showOverview}
    class:settings-stage--compact={compactLayout}
    data-testid={showOverview ? "setting-overview-page" : "setting-detail-page"}
  >
    {#if showOverview}
      <header class="settings-stage__heading border-b border-border pb-4" in:fade={{ duration: 140 }}>
        <div class="text-lg font-semibold" role="heading" aria-level="2">{t("settings.overviewTitle", "Damophus settings")}</div>
        <p class="mt-1 text-sm text-muted-foreground">{t("settings.overviewDescription", "Every module at a glance. Open one to adjust its settings, or drag the grips to reorder.")}</p>
      </header>
    {/if}

    <div class="settings-stage__navigation">
      <SettingOverview
        categories={overviewCategories}
        mode={showOverview ? "overview" : "navigation"}
        activeSelectId={focusGroup}
        compact={compactLayout}
        reorderHint={t("settings.dragToReorder", "Drag to reorder")}
        enabledLabel={t("settings.moduleEnabled", "Enable this module")}
        overviewLabel={t("settings.backToOverview", "Back to overview")}
        on:select={(event) => selectFromOverview(event.detail)}
        on:toggle={onOverviewToggle}
        on:overview={showOverviewPage}
        on:reorder={onOverviewReorder}
      />
    </div>

  {#if !showOverview}
  <main class="settings-stage__detail min-w-0 overflow-y-auto overscroll-contain" in:fade={{ duration: 180 }}>
    <div class={`mx-auto box-border flex w-full max-w-5xl flex-col ${compactLayout ? "gap-4 p-4" : "gap-5 p-6"}`}>
      {#if !showQuestionBankSettings && !showLayoutActionsSettings && !showCalloutAppearanceSettings}
        <header class="border-b border-border pb-4">
          <div class="text-lg font-semibold" role="heading" aria-level="2">{getGroupLabel(focusGroup)}</div>
        </header>
      {/if}

      <!-- Damophus theme settings are temporarily hidden; the panel follows SiYuan's theme. -->
      {#if focusGroup === SWITCH_GROUP}
        <SwitchSettings
          items={focusedSettingItems}
          categories={switchCategories}
          translate={t}
          expandedState={navState.switchesExpanded ?? {}}
          on:changed={(event) => onChanged(new CustomEvent("changed", { detail: { group: SWITCH_GROUP, ...event.detail } }))}
          on:bulkChanged={onBulkSwitchChanged}
          on:expandedChanged={onSwitchesExpandedChanged}
        />
      {:else if focusedPlugin && !showQuestionBankSettings && !showLayoutActionsSettings && !showCalloutAppearanceSettings}
        <!--
          Module enable controls are managed from the settings overview.
          Uncomment this panel to restore the enable switch inside plugin details.
        <SettingPanel
          group={focusGroup}
          settingItems={moduleEnabledSettingItems}
          mobile={compactLayout}
          on:changed={onChanged}
        />
        -->
      {/if}

      {#if showEntryManagement}
        <EntryManagementSettings
          modules={settingItems[ENTRY_GROUP] ?? []}
          labels={entryManagementLabels()}
          translate={translateKey}
          mobile={compactLayout}
          on:changed={onChanged}
        />
      {:else if showBlockAttributeSettings}
        <BlockAttributeSettings
          customProperties={getFocusedSettingValue("customProperties", DEFAULT_CUSTOM_PROPERTIES)}
          customPropertyBlockTypes={getFocusedSettingValue("customPropertyBlockTypes", DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES)}
          customStyle={getFocusedSettingValue("customStyle", DEFAULT_CUSTOM_PROPERTY_STYLE)}
          theme={selectedTheme}
          {mode}
          mobile={compactLayout}
          labels={blockAttributeLabels()}
          on:changed={(event) => void onChanged(new CustomEvent("changed", { detail: { group: focusGroup, ...event.detail } }))}
          on:preview={(event) => onPreview(new CustomEvent("preview", { detail: { group: focusGroup, ...event.detail } }))}
        />
      {:else if showQuestionBankSettings}
        <QuestionBankSettings
          group={focusGroup}
          title={getGroupLabel(focusGroup)}
          moduleSettingItems={moduleEnabledSettingItems}
          settingItems={moduleSpecificSettingItems}
          mobile={compactLayout}
          labels={questionBankSettingsLabels()}
          on:changed={onChanged}
          on:click={onClick}
          on:preview={onPreview}
        />
      {:else if showLayoutActionsSettings}
        <LayoutActionsSettings
          group={focusGroup}
          title={getGroupLabel(focusGroup)}
          moduleSettingItems={moduleEnabledSettingItems}
          actions={layoutActions}
          dockPosition={layoutActionsDockPosition}
          mobile={compactLayout}
          labels={layoutActionsSettingsLabels()}
          on:changed={onChanged}
        />
      {:else if showCalloutAppearanceSettings}
        <CalloutAppearanceSettings
          group={focusGroup}
          title={getGroupLabel(focusGroup)}
          moduleSettingItems={moduleEnabledSettingItems}
          settingItems={moduleSpecificSettingItems}
          labels={calloutAppearanceSettingsLabels()}
          mobile={compactLayout}
          on:changed={onChanged}
          on:preview={onPreview}
        />
      {:else if focusGroup !== SWITCH_GROUP && moduleSpecificSettingItems.length > 0}
        <SettingPanel
          group={focusGroup}
          settingItems={moduleSpecificSettingItems}
          mobile={compactLayout}
          on:changed={onChanged}
          on:click={onClick}
          on:preview={onPreview}
        />
      {/if}

      {#if !showBlockAttributeSettings && !showQuestionBankSettings}
        <div class="flex items-center justify-between gap-3 border-y border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span class="flex items-center gap-2"><Info class="size-4" />{t("settings.restartWarning", "Some changes require a plugin restart.")}</span>
          <Button variant="ghost" size="sm" onclick={() => location.reload()}>{t("settings.reloadNow", "Reload now")}</Button>
        </div>
      {/if}
    </div>
  </main>
  {/if}
  </div>
</div>

<style>
  .settings-stage {
    min-width: 0;
    min-height: 0;
    flex: 1;
    display: grid;
  }

  .settings-stage--overview {
    box-sizing: border-box;
    width: 100%;
    max-width: 72rem;
    margin-inline: auto;
    padding: 1.5rem;
    gap: 1.25rem;
    grid-template-columns: minmax(0, 100%) minmax(0, 0fr);
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas:
      "heading heading"
      "navigation detail";
    overflow-y: auto;
  }

  .settings-stage--detail {
    grid-template-columns: minmax(0, 16rem) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    grid-template-areas: "navigation detail";
    overflow: hidden;
  }

  .settings-stage__heading { grid-area: heading; }

  .settings-stage__navigation {
    grid-area: navigation;
    min-width: 0;
    overflow-y: auto;
    transition: background-color 200ms ease, border-color 200ms ease;
  }

  .settings-stage--detail .settings-stage__navigation {
    padding: 0.75rem;
    border-right: 1px solid var(--border);
    background: color-mix(in srgb, var(--muted) 24%, transparent);
  }

  .settings-stage__detail { grid-area: detail; }

  .settings-stage--compact.settings-stage--overview {
    padding: 1rem;
    gap: 1rem;
  }

  .settings-stage--compact.settings-stage--detail {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas:
      "navigation"
      "detail";
  }

  .settings-stage--compact.settings-stage--detail .settings-stage__navigation {
    max-height: 8.75rem;
    padding: 0.75rem;
    overflow-y: auto;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  @media (prefers-reduced-motion: reduce) {
    .settings-stage,
    .settings-stage__navigation { transition-duration: 0ms; }
  }
</style>
