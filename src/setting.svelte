<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { ChevronDown, Info, X } from "lucide-svelte";
  import { showMessage } from "siyuan";
  import { Button } from "@/components/ui/button";
  import { enableLogging } from "@/libs/logger";
  import { settings } from "@/settings";
  import { applyThemeVariables, getHostColorMode, observeHostColorMode } from "@/theme/runtime";
  import { parseStoredThemes, type DamophusTheme } from "@/theme/schema";
  import { BUILTIN_THEMES, DEFAULT_THEME_ID, findTheme } from "@/theme/themes";
  import { mergeCustomThemes, removeCustomTheme } from "@/theme/library";
  import ThemeSettings from "@/theme/ThemeSettings.svelte";
  import SettingPanel from "./libs/setting-panel.svelte";
  import BlockAttributeSettings from "./lets-block-attr/BlockAttributeSettings.svelte";
  import {
    DEFAULT_CUSTOM_PROPERTIES,
    DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
    DEFAULT_CUSTOM_PROPERTY_STYLE,
  } from "./lets-block-attr/custom-properties";
  import { PluginRegistry } from "./plugin-registry";
  import { plugin } from "./utils";

  const THEME_GROUP = "主题";
  const SWITCH_GROUP = "开关";
  const GENERAL_GROUP = "设置";
  const BLOCK_ATTRIBUTE_PLUGIN = "quickAttr";

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
  let focusGroup = THEME_GROUP;
  let showBottomSheet = false;
  let themeRoot: HTMLElement;
  let mode = getHostColorMode();
  let customThemes = parseStoredThemes(settings.get("customThemes"));
  let savedThemeId = typeof settings.get("uiThemeId") === "string"
    ? settings.get("uiThemeId")
    : DEFAULT_THEME_ID;
  let selectedThemeId = savedThemeId;

  $: groups = [
    THEME_GROUP,
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
  $: if (groups && !groups.includes(focusGroup)) focusGroup = THEME_GROUP;
  $: if (themeRoot) applyThemeVariables(themeRoot, selectedTheme, mode);

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

  function themeLabels() {
    return {
      builtin: t("settings.themeBuiltin", "Built-in themes"),
      custom: t("settings.themeCustom", "Custom themes"),
      import: t("settings.themeImport", "Import JSON"),
      export: t("settings.themeExport", "Export custom themes"),
      apply: t("settings.themeApply", "Apply theme"),
      applied: t("settings.themeApplied", "Applied"),
      reset: t("settings.themeReset", "Use default"),
      remove: t("settings.themeRemove", "Remove theme"),
      empty: t("settings.themeEmpty", "No custom themes"),
      importConfirm: t("settings.themeImportConfirm", "Import"),
      importSummary: t("settings.themeImportSummary", "{count} valid themes ready"),
      invalidFile: t("settings.themeInvalidFile", "No valid themes found"),
    };
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

  async function persistThemeLibrary(themes: DamophusTheme[]) {
    customThemes = themes;
    settings.set("customThemes", themes);
    await settings.save();
  }

  async function applySelectedTheme(id: string) {
    selectedThemeId = id;
    savedThemeId = id;
    settings.set("uiThemeId", id);
    await settings.save();
    await PluginRegistry.getInstance().beginPlugin(BLOCK_ATTRIBUTE_PLUGIN);
  }

  async function removeTheme(name: string) {
    const removedId = `custom:${name}`;
    const nextThemes = removeCustomTheme(customThemes, name);
    if (selectedThemeId === removedId) selectedThemeId = DEFAULT_THEME_ID;
    if (savedThemeId === removedId) {
      savedThemeId = DEFAULT_THEME_ID;
      settings.set("uiThemeId", DEFAULT_THEME_ID);
    }
    await persistThemeLibrary(nextThemes);
    await PluginRegistry.getInstance().beginPlugin(BLOCK_ATTRIBUTE_PLUGIN);
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
  bind:this={themeRoot}
  class="damophus-theme-root flex h-full min-h-0 overflow-hidden bg-background text-foreground max-[768px]:flex-col"
>
  <nav class="w-48 shrink-0 overflow-y-auto border-r border-border bg-muted/30 p-3 max-[768px]:hidden" aria-label={t("settings.selectCategory", "Setting categories")}>
    <div class="mb-3 border-b border-border px-2 pb-3">
      <strong class="block text-sm font-semibold">Damophus</strong>
      <span class="text-xs text-muted-foreground">{t("settings.preferences", "Preferences")}</span>
    </div>
    <ul class="m-0 flex list-none flex-col gap-1 p-0">
      {#each groups as group}
        <li>
          <button
            class="flex h-9 w-full items-center rounded-md px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            class:bg-primary={group === focusGroup}
            class:text-primary-foreground={group === focusGroup}
            class:font-medium={group === focusGroup}
            onclick={() => (focusGroup = group)}
          >
            <span class="min-w-0 truncate">{getGroupLabel(group)}</span>
          </button>
        </li>
      {/each}
    </ul>
  </nav>

  <Button
    class="m-3 hidden w-auto justify-between max-[768px]:flex"
    variant="outline"
    onclick={() => (showBottomSheet = true)}
  >
    {getGroupLabel(focusGroup)}
    <ChevronDown />
  </Button>

  <main class="min-w-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-5 p-6 max-[768px]:p-4">
      <header class="border-b border-border pb-4">
        <h2 class="m-0 text-lg font-semibold">{getGroupLabel(focusGroup)}</h2>
        {#if focusGroup === THEME_GROUP}
          <p class="mt-1 text-sm text-muted-foreground">{t("settings.themeDescription", "Choose the appearance used by Damophus settings and question markers.")}</p>
        {/if}
      </header>

      {#if focusGroup === THEME_GROUP}
        <ThemeSettings
          builtinThemes={BUILTIN_THEMES}
          {customThemes}
          selectedId={selectedThemeId}
          savedId={savedThemeId}
          {mode}
          labels={themeLabels()}
          on:select={(event) => (selectedThemeId = event.detail.id)}
          on:apply={(event) => void applySelectedTheme(event.detail.id)}
          on:import={(event) => void persistThemeLibrary(mergeCustomThemes(customThemes, event.detail.themes).themes)}
          on:remove={(event) => void removeTheme(event.detail.name)}
          on:reset={() => (selectedThemeId = DEFAULT_THEME_ID)}
        />
      {:else if showBlockAttributeSettings}
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
      {:else}
        <SettingPanel
          group={focusGroup}
          settingItems={settingItems[focusGroup] ?? []}
          on:changed={onChanged}
          on:click={onClick}
          on:preview={onPreview}
        />
      {/if}

      {#if focusGroup !== THEME_GROUP && !showBlockAttributeSettings}
        <div class="flex items-center justify-between gap-3 border-y border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span class="flex items-center gap-2"><Info class="size-4" />{t("settings.restartWarning", "Some changes require a plugin restart.")}</span>
          <Button variant="ghost" size="sm" onclick={() => location.reload()}>{t("settings.reloadNow", "Reload now")}</Button>
        </div>
      {/if}
    </div>
  </main>
</div>

{#if showBottomSheet}
  <div class="damophus-theme-root fixed inset-0 z-[9999] flex items-end bg-black/45" role="presentation" onclick={() => (showBottomSheet = false)}>
    <div
      class="max-h-[70dvh] w-full overflow-y-auto rounded-t-lg border-t border-border bg-popover p-4 text-popover-foreground shadow-lg"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => event.stopPropagation()}
    >
      <div class="mb-3 flex items-center justify-between border-b border-border pb-3">
        <strong class="text-sm">{t("settings.selectCategory", "Select category")}</strong>
        <Button variant="ghost" size="icon-sm" title={t("settings.close", "Close")} onclick={() => (showBottomSheet = false)}><X /><span class="sr-only">{t("settings.close", "Close")}</span></Button>
      </div>
      <div class="flex flex-col gap-1">
        {#each groups as group}
          <button
            class="min-h-10 rounded-md px-3 text-left text-sm hover:bg-muted"
            class:bg-primary={group === focusGroup}
            class:text-primary-foreground={group === focusGroup}
            onclick={() => {
              focusGroup = group;
              showBottomSheet = false;
            }}
          >{getGroupLabel(group)}</button>
        {/each}
      </div>
    </div>
  </div>
{/if}
