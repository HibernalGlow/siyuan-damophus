<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Info } from "lucide-svelte";
  import { showMessage } from "siyuan";
  import { Button } from "@/components/ui/button";
  import { enableLogging } from "@/libs/logger";
  import { resolveEntrySetting } from "@/libs/plugin-entry-settings";
  import { settings } from "@/settings";
  import { getHostColorMode, observeHostColorMode } from "@/theme/runtime";
  import { parseStoredThemes } from "@/theme/schema";
  import { DEFAULT_THEME_ID, findTheme } from "@/theme/themes";
  import SettingPanel from "./libs/setting-panel.svelte";
  import BlockAttributeSettings from "./lets-block-attr/BlockAttributeSettings.svelte";
  import QuestionBankSettings from "./lets-question-bank/QuestionBankSettings.svelte";
  import LayoutActionsSettings from "./lets-layout-actions/LayoutActionsSettings.svelte";
  import {
    DEFAULT_CUSTOM_PROPERTIES,
    DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
    DEFAULT_CUSTOM_PROPERTY_STYLE,
  } from "./lets-block-attr/custom-properties";
  import { PluginRegistry } from "./plugin-registry";
  import { isMobile, plugin } from "./utils";
  import SettingCategoryNavigation from "./components/setting-category-navigation.svelte";
  import {
    isMobileAppearanceShortcutEnabled,
    MOBILE_APPEARANCE_SHORTCUT_CHANGED,
    MOBILE_APPEARANCE_SHORTCUT_SETTING,
  } from "./mobile-appearance";

  const SWITCH_GROUP = "开关";
  const GENERAL_GROUP = "设置";
  const BLOCK_ATTRIBUTE_PLUGIN = "quickAttr";
  const QUESTION_BANK_PLUGIN = "questionBank";
  const COMPACT_LAYOUT_MAX_WIDTH = 720;
  const LAYOUT_ACTIONS_PLUGIN = "layoutActions";

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
          type: "checkbox",
          title: "settings.mobileAppearanceShortcut",
          description: "settings.mobileAppearanceShortcutDesc",
          key: MOBILE_APPEARANCE_SHORTCUT_SETTING,
          value: isMobileAppearanceShortcutEnabled(
            settings.get(MOBILE_APPEARANCE_SHORTCUT_SETTING),
          ),
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

    for (const pluginMeta of pluginConfigs) {
      dynamicSettings[SWITCH_GROUP].push({
        type: "checkbox",
        title: pluginMeta.displayName || pluginMeta.name,
        description: pluginMeta.description || "",
        key: pluginMeta.name,
        value: settings.getBySpace(pluginMeta.name, "enabled") ?? pluginMeta.enabled ?? false,
        hasSetting: Boolean(pluginMeta.settings),
      });
      const pluginSettings = pluginMeta.settings?.map((item) => ({
        ...item,
        value: storedPluginSetting(pluginMeta.name, item.key, item.value),
      }));
      if (pluginSettings?.length) dynamicSettings[pluginMeta.displayName] = pluginSettings;
    }
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
  let savedThemeId = typeof settings.get("uiThemeId") === "string"
    ? settings.get("uiThemeId")
    : DEFAULT_THEME_ID;
  let selectedThemeId = savedThemeId;
  let settingRoot: HTMLDivElement;
  let compactLayout = isMobile;
  let showCompactCategories = compactLayout;

  $: groups = [
    SWITCH_GROUP,
    GENERAL_GROUP,
    ...settingItems[SWITCH_GROUP]
      .filter((item) => item.value === true && item.hasSetting)
      .map((item) => item.title),
  ];
  $: selectedTheme = findTheme(selectedThemeId, customThemes);
  $: focusedPlugin = PluginRegistry.getInstance().getPluginConfigs().find(
    (item) => item.displayName === focusGroup || item.name === focusGroup,
  );
  $: showBlockAttributeSettings = focusedPlugin?.name === BLOCK_ATTRIBUTE_PLUGIN;
  $: showQuestionBankSettings = focusedPlugin?.name === QUESTION_BANK_PLUGIN;
  $: showLayoutActionsSettings = focusedPlugin?.name === LAYOUT_ACTIONS_PLUGIN;
  $: layoutActions = settingItems[focusGroup]?.find((item) => item.key === "actions")?.value ?? [];
  $: layoutActionsDockEnabled = Boolean(settingItems[focusGroup]?.find((item) => item.key === "showDock")?.value);
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
      dockEnabled: t("lets-layout-actions.dockEnabled", "Add a custom action Dock"),
      dockEnabledDescription: t("lets-layout-actions.dockEnabledDescription", "Show configured Dock actions."),
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

  async function onClick({ detail }: CustomEvent<ChangeEvent>) {
    if (detail.group === GENERAL_GROUP && detail.key === "resetData") {
      await settings.resetData();
      settingItems = initData();
      customThemes = parseStoredThemes(settings.get("customThemes"));
      selectedThemeId = savedThemeId = settings.get("uiThemeId") ?? DEFAULT_THEME_ID;
      showMessage(t("settings.resetSuccess", "Configuration reset"));
    } else if (detail.group === GENERAL_GROUP && detail.key === "mergeData") {
      await settings.mergeData();
      settingItems = initData();
      showMessage(t("settings.mergeSuccess", "Configuration merged"));
    }
  }

  async function onChanged({ detail }: CustomEvent<ChangeEvent>) {
    if (detail.group === SWITCH_GROUP) {
      settings.setBySpace(detail.key, "enabled", detail.value);
      if (detail.value) await PluginRegistry.getInstance().beginPlugin(detail.key);
      else PluginRegistry.getInstance().unloadPlugin(detail.key);
      settingItems = initData();
    } else if (detail.group === GENERAL_GROUP) {
      settings.set(detail.key, detail.value);
      if (detail.key === "debugLogging") enableLogging(detail.value);
      if (detail.key === MOBILE_APPEARANCE_SHORTCUT_SETTING) {
        window.dispatchEvent(new CustomEvent(MOBILE_APPEARANCE_SHORTCUT_CHANGED));
      }
    } else {
      const pluginSetting = settingItems[SWITCH_GROUP].find((item) => item.title === detail.group);
      if (!pluginSetting) return;
      settings.setBySpace(pluginSetting.key, detail.key, detail.value);
      await PluginRegistry.getInstance().beginPlugin(pluginSetting.key);
    }
    updateLocalSetting(detail.group, detail.key, detail.value);
    await settings.save();
  }

  function onPreview({ detail }: CustomEvent<ChangeEvent>) {
    updateLocalSetting(detail.group, detail.key, detail.value);
  }

  function selectGroup(group: string) {
    focusGroup = group;
    if (compactLayout) showCompactCategories = false;
  }

  function showCategoryList() {
    if (compactLayout) showCompactCategories = true;
  }

  onMount(() => {
    const stopObservingColorMode = observeHostColorMode((nextMode) => {
      mode = nextMode;
    });
    const updateLayout = () => {
      const nextCompactLayout = isMobile || settingRoot.clientWidth <= COMPACT_LAYOUT_MAX_WIDTH;
      if (nextCompactLayout === compactLayout) return;
      compactLayout = nextCompactLayout;
      showCompactCategories = nextCompactLayout;
    };
    const layoutObserver = new ResizeObserver(updateLayout);
    const hostWindow = window as Window & { goBack?: (...args: unknown[]) => unknown };
    const originalGoBack = hostWindow.goBack;
    const compactGoBack = (...args: unknown[]) => {
      if (compactLayout && !showCompactCategories) {
        showCompactCategories = true;
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
  <SettingCategoryNavigation
    {groups}
    {focusGroup}
    mobile={compactLayout}
    showCategories={showCompactCategories}
    getGroupLabel={getGroupLabel}
    categoryLabel={t("settings.selectCategory", "Setting categories")}
    categoryDescription={t("settings.selectCategoryDescription", "Choose which Damophus settings to display.")}
    preferencesLabel={t("settings.preferences", "Preferences")}
    backLabel={t("settings.back", "Back")}
    on:select={(event) => selectGroup(event.detail)}
    on:back={showCategoryList}
  />

  <main class="min-w-0 flex-1 overflow-y-auto overscroll-contain" class:hidden={compactLayout && showCompactCategories}>
    <div class={`mx-auto box-border flex w-full max-w-5xl flex-col ${compactLayout ? "gap-4 p-4" : "gap-5 p-6"}`}>
      {#if !showQuestionBankSettings && !showLayoutActionsSettings}
        <header class="border-b border-border pb-4">
          <div class="text-lg font-semibold" role="heading" aria-level="2">{getGroupLabel(focusGroup)}</div>
        </header>
      {/if}

      <!-- Damophus theme settings are temporarily hidden; the panel follows SiYuan's theme. -->
      {#if showBlockAttributeSettings}
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
          settingItems={settingItems[focusGroup] ?? []}
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
          actions={layoutActions}
          showDock={layoutActionsDockEnabled}
          dockPosition={layoutActionsDockPosition}
          mobile={compactLayout}
          labels={layoutActionsSettingsLabels()}
          on:changed={onChanged}
        />
      {:else}
        <SettingPanel
          group={focusGroup}
          settingItems={settingItems[focusGroup] ?? []}
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
</div>
