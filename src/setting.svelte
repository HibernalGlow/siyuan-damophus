<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Info } from "lucide-svelte";
  import { showMessage } from "siyuan";
  import { Button } from "@/components/ui/button";
  import { enableLogging } from "@/libs/logger";
  import { settings } from "@/settings";
  import { getHostColorMode, observeHostColorMode } from "@/theme/runtime";
  import { parseStoredThemes } from "@/theme/schema";
  import { DEFAULT_THEME_ID, findTheme } from "@/theme/themes";
  import SettingPanel from "./libs/setting-panel.svelte";
  import BlockAttributeSettings from "./lets-block-attr/BlockAttributeSettings.svelte";
  import SourceAnswerMaskSettings from "./lets-question-bank/SourceAnswerMaskSettings.svelte";
  import type { AnswerMaskStyle } from "./lets-question-bank/source-answer-mask";
  import {
    DEFAULT_CUSTOM_PROPERTIES,
    DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
    DEFAULT_CUSTOM_PROPERTY_STYLE,
  } from "./lets-block-attr/custom-properties";
  import { PluginRegistry } from "./plugin-registry";
  import { plugin } from "./utils";
  import SettingCategoryNavigation from "./components/setting-category-navigation.svelte";

  const SWITCH_GROUP = "开关";
  const GENERAL_GROUP = "设置";
  const BLOCK_ATTRIBUTE_PLUGIN = "quickAttr";
  const QUESTION_BANK_PLUGIN = "questionBank";
  const QUESTION_BANK_MASK_KEYS = new Set(["maskSourceAnswers", "answerMaskStyle"]);

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
        value: settings.getBySpace(pluginMeta.name, item.key) ?? item.value,
      }));
      if (pluginSettings?.length) dynamicSettings[pluginMeta.displayName] = pluginSettings;
    }
    return dynamicSettings;
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

  function getFocusedSettingAnyValue<T>(key: string, fallback: T): T {
    const value = settingItems[focusGroup]?.find((item) => item.key === key)?.value;
    return (value ?? fallback) as T;
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

  async function onClick({ detail }: CustomEvent<ChangeEvent>) {
    if (detail.group !== GENERAL_GROUP) return;
    if (detail.key === "resetData") {
      await settings.resetData();
      settingItems = initData();
      customThemes = parseStoredThemes(settings.get("customThemes"));
      selectedThemeId = savedThemeId = settings.get("uiThemeId") ?? DEFAULT_THEME_ID;
      showMessage(t("settings.resetSuccess", "Configuration reset"));
    } else if (detail.key === "mergeData") {
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

  onMount(() => observeHostColorMode((nextMode) => {
    mode = nextMode;
  }));

  onDestroy(async () => {
    await settings.save();
  });
</script>

<div
  class="damophus-theme-root damophus-question-bank-theme flex h-full min-h-0 overflow-hidden bg-background text-foreground max-[768px]:flex-col"
  data-color-mode={mode}
>
  <SettingCategoryNavigation
    {groups}
    {focusGroup}
    getGroupLabel={getGroupLabel}
    categoryLabel={t("settings.selectCategory", "Setting categories")}
    categoryDescription={t("settings.selectCategoryDescription", "Choose which Damophus settings to display.")}
    preferencesLabel={t("settings.preferences", "Preferences")}
    closeLabel={t("settings.close", "Close")}
    on:select={(event) => (focusGroup = event.detail)}
  />

  <main class="min-w-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-5 p-6 max-[768px]:p-4">
      <header class="border-b border-border pb-4">
        <h2 class="m-0 text-lg font-semibold">{getGroupLabel(focusGroup)}</h2>
      </header>

      <!-- Damophus theme settings are temporarily hidden; the panel follows SiYuan's theme. -->
      {#if showBlockAttributeSettings}
        <BlockAttributeSettings
          customProperties={getFocusedSettingValue("customProperties", DEFAULT_CUSTOM_PROPERTIES)}
          customPropertyBlockTypes={getFocusedSettingValue("customPropertyBlockTypes", DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES)}
          customStyle={getFocusedSettingValue("customStyle", DEFAULT_CUSTOM_PROPERTY_STYLE)}
          theme={selectedTheme}
          {mode}
          labels={blockAttributeLabels()}
          on:changed={(event) => void onChanged(new CustomEvent("changed", { detail: { group: focusGroup, ...event.detail } }))}
          on:preview={(event) => onPreview(new CustomEvent("preview", { detail: { group: focusGroup, ...event.detail } }))}
        />
      {:else if showQuestionBankSettings}
        <SettingPanel
          group={focusGroup}
          settingItems={(settingItems[focusGroup] ?? []).filter((item) => !QUESTION_BANK_MASK_KEYS.has(item.key))}
          on:changed={onChanged}
          on:click={onClick}
          on:preview={onPreview}
        />
        <SourceAnswerMaskSettings
          enabled={getFocusedSettingAnyValue("maskSourceAnswers", false)}
          style={getFocusedSettingValue("answerMaskStyle", "blur") as AnswerMaskStyle}
          labels={questionBankMaskLabels()}
          on:changed={(event) => void onChanged(new CustomEvent("changed", { detail: { group: focusGroup, ...event.detail } }))}
          on:preview={(event) => onPreview(new CustomEvent("preview", { detail: { group: focusGroup, ...event.detail } }))}
        />
      {:else}
        <SettingPanel
          group={focusGroup}
          settingItems={settingItems[focusGroup] ?? []}
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
