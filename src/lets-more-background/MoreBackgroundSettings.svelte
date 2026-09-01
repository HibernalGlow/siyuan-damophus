<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import {
    Check,
    CheckCircle2,
    Database,
    HardDrive,
    History,
    Image,
    Images,
    Key,
    Layers,
    Loader2,
    SlidersHorizontal,
    Sparkles,
    Star,
    X,
    XCircle,
  } from "lucide-svelte";
  import "./settings/more-background-settings.css";
  // [条件图形视图-暂停维护] import ConditionGraph from "@/components/condition-graph/ConditionGraph.svelte";
  // [条件图形视图-暂停维护] import { coverConditionToGraph } from "./cover-condition-graph";
  import CoverTemplatesTab from "./settings/CoverTemplatesTab.svelte";
  import CoverTagPoolsTab from "./settings/CoverTagPoolsTab.svelte";
  import CoverCredentialsTab from "./settings/CoverCredentialsTab.svelte";
  import CoverBasicTab from "./settings/CoverBasicTab.svelte";
  import CoverCacheTab from "./settings/CoverCacheTab.svelte";
  import CoverFavoritesTab from "./settings/CoverFavoritesTab.svelte";
  import CoverHistoryTab from "./settings/CoverHistoryTab.svelte";
  import CoverStashTab from "./settings/CoverStashTab.svelte";
  import {
    DEFAULT_SITE_CREDENTIALS,
    DEFAULT_TAG_POOLS,
    DEFAULT_TEMPLATES,
    templateToUrl,
    COVER_CONDITION_SCHEMA_VERSION,
    migrateLegacyCoverRules,
    needsConditionMigration,
    type CoverConditionGroup,
    type CoverConditionRule,
    type CoverTemplateItem,
    type FilterRule,
    type SiteCredential,
    type TagPool,
  } from "./sources";
  import { loadTagPoolsFromStorage, saveTagPoolsToStorage } from "./tag-pool-storage";
  import { plugin } from "@/utils";
  import { settings } from "@/settings";

  export let group = "moreBackground";
  export let title = "题头图Plus";
  export let templates: CoverTemplateItem[] = [];
  export let tagPools: TagPool[] = [];
  export let siteCredentials: SiteCredential[] = [];
  export let width = 1920;
  export let height = 1080;
  export let assetsLocation = "/assets/more-background";
  export let readFromAssets = true;
  export let writeToAssets = false;
  export let localCache = false;
  export let autoCacheLegacyCovers = false;
  export let purgeCacheOnCoverChange = false;
  export let localCacheRoot = "/storage/petal/siyuan-damophus/more-background/covers";
  export let localCachePathTemplate = "{year}/{month}/{hash}.webp";
  export let localCacheMaxEdge: "none" | "1280" | "1920" | "2560" = "1920";
  export let directDrag = false;
  export let debugLogging = false;
  export let toolbarPosition: "adaptive" | "belowTags" | "belowIcon" | "native" | "custom" = "adaptive";
  export let toolbarCustomX = 50;
  export let toolbarCustomY = 15;
  export let coverBreadcrumb = false;
  export let coverDocumentMenu = false;
  export let confirmRemoveCover = true;
  export let coverHistoryLimit = 150;
  export let coverSeenLimit = 800;
  export let gachaMode = false;
  export let gachaDrawCount = 6;
  export let mobile = false;
  export let onMaintenance: ((detail: { action: "maintain" | "cleanup" | "resetMobilePosition"; documentLink?: string }) => void | Promise<void>) | undefined;

  const dispatch = createEventDispatcher();

  type TopTab = "templates" | "pools" | "gallery" | "settings";

  let activeTab: TopTab = "templates";
  let galleryView: "favorites" | "history" | "stash" = "favorites";
  let settingsView: "basic" | "cache" | "access" = "basic";

  function t(key: string, fallback?: string): string {
    return (plugin.i18n as any)[key] || fallback || key;
  }

  // 子组件统一使用 (key, fallback) => string 的 label 契约（与题库工作台一致）。
  const label = (key: string, fallback: string): string => t(key, fallback);

  function ensureTemplateRules(tpl: CoverTemplateItem, pools: TagPool[]): FilterRule[] {
    if (tpl.rules && tpl.rules.length > 0) return tpl.rules;
    const generated: FilterRule[] = [];
    if (tpl.aspectRatio) {
      generated.push({ id: `r-ratio-${tpl.id}`, field: "aspectRatio", operator: "equals", value: tpl.aspectRatio });
    } else {
      generated.push({ id: `r-ratio-${tpl.id}`, field: "aspectRatio", operator: "equals", value: "landscape" });
    }

    if (tpl.poolId) {
      generated.push({ id: `r-pool-${tpl.id}`, field: "tagPool", operator: "randomIn", value: tpl.poolId });
    } else if (tpl.pool && tpl.pool.length > 0) {
      generated.push({ id: `r-pool-${tpl.id}`, field: "tagPool", operator: "randomIn", value: pools[0]?.id || "" });
    }

    if (tpl.site) {
      generated.push({ id: `r-site-${tpl.id}`, field: "site", operator: "equals", value: tpl.site });
    }
    if (tpl.rating) {
      generated.push({ id: `r-rating-${tpl.id}`, field: "rating", operator: "equals", value: tpl.rating });
    }
    if (tpl.tags) {
      generated.push({ id: `r-tags-${tpl.id}`, field: "tags", operator: "contains", value: tpl.tags });
    }
    if (tpl.minScore) {
      generated.push({ id: `r-score-${tpl.id}`, field: "minScore", operator: "gte", value: tpl.minScore });
    }
    if (tpl.blacklist) {
      generated.push({ id: `r-bl-${tpl.id}`, field: "blacklist", operator: "containsNone", value: tpl.blacklist });
    }
    return generated;
  }

  $: normalizedTagPools = (tagPools && tagPools.length > 0 ? tagPools : DEFAULT_TAG_POOLS).map((p) => ({
    ...p,
    items: p.items || [],
  }));

  $: rawTemplatesList =
    templates && templates.length > 0 ? templates : DEFAULT_TEMPLATES;

  $: normalizedTemplates = rawTemplatesList.map((tpl) => ({
    ...tpl,
    rules: ensureTemplateRules(tpl, normalizedTagPools),
  }));

  $: normalizedCredentials =
    siteCredentials && siteCredentials.length > 0
      ? siteCredentials
      : DEFAULT_SITE_CREDENTIALS;

  // --- 实时保存状态跟踪 ---
  type SaveStatus = "idle" | "saving" | "saved" | "error";
  let saveStatus: SaveStatus = "idle";
  let lastSavedTime = "";
  let saveStatusResetTimer: any = null;

  async function syncChanges(
    nextTemplates: CoverTemplateItem[],
    nextTagPools: TagPool[],
    nextCredentials: SiteCredential[],
  ) {
    templates = nextTemplates;
    tagPools = nextTagPools;
    siteCredentials = nextCredentials;
    saveStatus = "saving";

    try {
      // 词库保存到工作区独立文件；模板与凭据实时写入插件设置。
      await saveTagPoolsToStorage(nextTagPools);

      const sources = nextTemplates.map((tpl) => ({
        label: tpl.name,
        url: templateToUrl(tpl, nextTagPools),
      }));

      settings.setBySpace(group, "templates", nextTemplates);
      settings.setBySpace(group, "siteCredentials", nextCredentials);
      settings.setBySpace(group, "sources", sources);
      await settings.save();

      dispatch("changed", { group, key: "templates", value: nextTemplates });
      dispatch("changed", { group, key: "siteCredentials", value: nextCredentials });
      dispatch("changed", { group, key: "sources", value: sources });

      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      lastSavedTime = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      saveStatus = "saved";
      if (saveStatusResetTimer) clearTimeout(saveStatusResetTimer);
      saveStatusResetTimer = setTimeout(() => {
        saveStatus = "idle";
      }, 3000);
    } catch (err) {
      console.error("Failed to save MoreBackground settings:", err);
      saveStatus = "error";
    }
  }

  async function handleBasicChange(key: string, value: unknown) {
    saveStatus = "saving";
    try {
      settings.setBySpace(group, key, value);
      await settings.save();
      dispatch("changed", { group, key, value });
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      lastSavedTime = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      saveStatus = "saved";
      if (saveStatusResetTimer) clearTimeout(saveStatusResetTimer);
      saveStatusResetTimer = setTimeout(() => {
        saveStatus = "idle";
      }, 3000);
    } catch (err) {
      console.error("Failed to save MoreBackground basic setting:", err);
      saveStatus = "error";
    }
  }

  // --- 模板操作 ---
  function addTemplate() {
    const stamp = Date.now();
    const newTpl: CoverTemplateItem = {
      id: `tpl-${stamp}`,
      name: `${t("lets-more-background.newTemplate", "新条件模板")} ${normalizedTemplates.length + 1}`,
      type: "booru",
      site: "safebooru.org",
      aspectRatio: "landscape",
      rating: "safe",
      tags: "wallpaper",
      poolId: normalizedTagPools[0]?.id || undefined,
      rules: [
        { id: `r1-${stamp}`, field: "aspectRatio", operator: "equals", value: "landscape" },
        { id: `r2-${stamp}`, field: "tagPool", operator: "randomIn", value: normalizedTagPools[0]?.id || "" },
        { id: `r3-${stamp}`, field: "site", operator: "equals", value: "safebooru.org" },
      ],
    };
    syncChanges([...normalizedTemplates, newTpl], normalizedTagPools, normalizedCredentials);
  }

  function updateTemplate(index: number, patch: Partial<CoverTemplateItem>) {
    syncChanges(
      normalizedTemplates.map((item, i) => (i === index ? { ...item, ...patch } : item)),
      normalizedTagPools,
      normalizedCredentials,
    );
  }

  function removeTemplate(index: number) {
    syncChanges(normalizedTemplates.filter((_, i) => i !== index), normalizedTagPools, normalizedCredentials);
  }

  function resetDefaults() {
    syncChanges(DEFAULT_TEMPLATES, DEFAULT_TAG_POOLS, normalizedCredentials);
  }

  function applyConditionToTemplate(tplIndex: number, condition: CoverConditionGroup) {
    const patch: Partial<CoverTemplateItem> = { condition, conditionSchema: COVER_CONDITION_SCHEMA_VERSION, rules: undefined };
    const backfill = (rule: CoverConditionRule) => {
      if (rule.field === "aspectRatio") patch.aspectRatio = rule.value;
      if (rule.field === "site") patch.site = rule.value;
      if (rule.field === "rating") patch.rating = rule.value;
      if (rule.field === "tags") patch.tags = rule.value;
      if (rule.field === "minScore") patch.minScore = Number(rule.value) || undefined;
      if (rule.field === "timeRange") patch.timeRange = rule.value;
      if (rule.field === "imageQuality") patch.imageQuality = rule.value;
      if (rule.field === "tagPool") patch.poolId = rule.value;
      if (rule.field === "blacklist") patch.blacklist = rule.value;
    };
    const walk = (group: CoverConditionGroup) => {
      group.rules.forEach((entry) => {
        if ("rules" in entry) walk(entry);
        else backfill(entry);
      });
    };
    walk(condition);
    updateTemplate(tplIndex, patch);
  }

  // --- 旧版条件迁移（schema 1 → 2），更新后首次打开设置时提示一次 ---
  let conditionMigrationOpen = false;
  let conditionMigrationSeen = false;
  $: legacyConditionTemplates = templates.filter(needsConditionMigration);
  $: if (!conditionMigrationSeen && legacyConditionTemplates.length > 0) {
    conditionMigrationSeen = true;
    conditionMigrationOpen = true;
  }

  function migrateAllConditions(): void {
    syncChanges(
      templates.map((tpl) => (needsConditionMigration(tpl)
        ? { ...tpl, condition: migrateLegacyCoverRules(tpl.rules ?? []), conditionSchema: COVER_CONDITION_SCHEMA_VERSION, rules: undefined }
        : tpl)),
      normalizedTagPools,
      normalizedCredentials,
    );
    conditionMigrationOpen = false;
  }

  // [条件图形视图-暂停维护] const migrationGraphLabels = {
  //   field: {
  //     aspectRatio: t("lets-more-background.fieldRatio", "比例"),
  //     site: t("lets-more-background.fieldSite", "站点"),
  //     rating: t("lets-more-background.fieldRating", "分级"),
  //     tags: t("lets-more-background.fieldTags", "固定 Tag"),
  //     minScore: t("lets-more-background.fieldMinScore", "最低分"),
  //     timeRange: t("lets-more-background.fieldTimeRange", "时间范围"),
  //     tagPool: t("lets-more-background.fieldTagPool", "词库"),
  //     imageQuality: t("lets-more-background.fieldImageQuality", "画质"),
  //     excludeTagPool: t("lets-more-background.fieldExcludeTagPool", "排除词库"),
  //     blacklist: t("lets-more-background.fieldBlacklist", "黑名单"),
  //   },
  //   operator: {
  //     equals: t("lets-more-background.opEquals", "等于"),
  //     contains: t("lets-more-background.opContains", "包含"),
  //     gte: t("lets-more-background.opGte", "不低于"),
  //     randomIn: t("lets-more-background.opRandomIn", "随机取"),
  //     excludeAllIn: t("lets-more-background.opExcludeAllIn", "排除全部"),
  //     containsNone: t("lets-more-background.opContainsNone", "不含"),
  //   },
  //   and: t("lets-more-background.conditionAnd", "且"),
  //   result: t("lets-more-background.conditionGraphResult", "封面图"),
  //   empty: t("lets-more-background.conditionGraphEmpty", "全部图片"),
  // };

  // --- 词库操作 ---
  function addTagPool() {
    const newPool: TagPool = {
      id: `pool-${Date.now()}`,
      name: `${t("lets-more-background.newPool", "新画师/Tag词库")} ${normalizedTagPools.length + 1}`,
      description: t("lets-more-background.newPoolDesc", "自定义画师名单或标签集合"),
      items: [],
    };
    syncChanges(normalizedTemplates, [...normalizedTagPools, newPool], normalizedCredentials);
  }

  function updateTagPool(index: number, patch: Partial<TagPool>) {
    syncChanges(
      normalizedTemplates,
      normalizedTagPools.map((item, i) => (i === index ? { ...item, ...patch } : item)),
      normalizedCredentials,
    );
  }

  function removeTagPool(index: number) {
    syncChanges(normalizedTemplates, normalizedTagPools.filter((_, i) => i !== index), normalizedCredentials);
  }

  // --- 凭据操作 ---
  function addCredential() {
    const newCred: SiteCredential = {
      id: `cred-${Date.now()}`,
      site: "danbooru.donmai.us",
      login: "",
      apiKey: "",
      enabled: true,
    };
    syncChanges(normalizedTemplates, normalizedTagPools, [...normalizedCredentials, newCred]);
  }

  function updateCredential(index: number, patch: Partial<SiteCredential>) {
    syncChanges(
      normalizedTemplates,
      normalizedTagPools,
      normalizedCredentials.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function removeCredential(index: number) {
    syncChanges(normalizedTemplates, normalizedTagPools, normalizedCredentials.filter((_, i) => i !== index));
  }

  $: tabs = [
    {
      id: "templates" as const,
      icon: Layers,
      name: t("lets-more-background.templatesTab", "条件模板与过滤器"),
      short: t("lets-more-background.templatesTabShort", "模板"),
      count: normalizedTemplates.length,
    },
    {
      id: "pools" as const,
      icon: Database,
      name: t("lets-more-background.tagPoolsTab", "Tag / 画师词库池"),
      short: t("lets-more-background.tagPoolsTabShort", "词库"),
      count: normalizedTagPools.length,
    },
    {
      id: "gallery" as const,
      icon: Images,
      name: t("lets-more-background.galleryTab", "题头图图库"),
      short: t("lets-more-background.galleryTabShort", "图库"),
      count: 0,
    },
    {
      id: "settings" as const,
      icon: SlidersHorizontal,
      name: t("lets-more-background.settingsTab", "基础与存储设置"),
      short: t("lets-more-background.settingsTabShort", "设置"),
      count: 0,
    },
  ];

  onMount(() => {
    void (async () => {
      try {
        const loaded = await loadTagPoolsFromStorage();
        if (loaded && loaded.length > 0) {
          tagPools = loaded;
        }
      } catch (e) {
        console.warn("Failed to load tag pools from storage on mount:", e);
      }
    })();
  });
</script>

<div class="more-background-settings" class:mobile>
  <div class="mb-frame">
    <header class="mb-header">
      <div class="mb-identity">
        <span class="mb-icon-chip mb-icon-chip--lg" aria-hidden="true"><Image class="size-4" /></span>
        <div class="min-w-0">
          <div class="mb-title-row">
            <h2 class="mb-title">{title}</h2>
            <span class="mb-version-badge">v2.0 Plus</span>
          </div>
          <p class="mb-description">{t("lets-more-background.description")}</p>
        </div>
      </div>

      <div class="mb-save-pill" data-state={saveStatus} title={t("lets-more-background.autoSaveTitle", "配置实时自动保存状态")}>
        {#if saveStatus === "saving"}
          <Loader2 class="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
          <span class="mb-save-label">{t("lets-more-background.saving", "正在保存...")}</span>
        {:else if saveStatus === "saved"}
          <CheckCircle2 class="size-3.5 shrink-0" aria-hidden="true" />
          <span class="mb-save-label">{t("lets-more-background.autoSaved", "已自动保存")}</span>
          {#if lastSavedTime}<span class="mb-save-time mb-save-label-time mb-mono">{lastSavedTime}</span>{/if}
        {:else if saveStatus === "error"}
          <XCircle class="size-3.5 shrink-0" aria-hidden="true" />
          <span class="mb-save-label">{t("lets-more-background.saveFailed", "保存失败")}</span>
        {:else}
          <Check class="size-3.5 shrink-0" aria-hidden="true" />
          <span class="mb-save-label">{t("lets-more-background.autoSaveReady", "自动保存就绪")}</span>
        {/if}
      </div>
    </header>

    <div class="mb-body" data-has-nav="true">
      {#if activeTab === "templates"}
        <div id="mb-panel-templates" class="mb-panel" role="tabpanel" aria-labelledby="mb-tab-templates">
          <CoverTemplatesTab
            {label}
            templates={normalizedTemplates}
            tagPools={normalizedTagPools}
            siteCredentials={normalizedCredentials}
            {writeToAssets}
            onAdd={addTemplate}
            onUpdate={updateTemplate}
            onRemove={removeTemplate}
            onApplyCondition={applyConditionToTemplate}
            onReorder={(items) => syncChanges(items, normalizedTagPools, normalizedCredentials)}
            onResetDefaults={resetDefaults}
            onImport={(nextTemplates, nextPools) => syncChanges(nextTemplates, nextPools, normalizedCredentials)}
          />
        </div>
      {:else if activeTab === "pools"}
        <div id="mb-panel-pools" class="mb-panel" role="tabpanel" aria-labelledby="mb-tab-pools">
          <CoverTagPoolsTab
            {label}
            pools={normalizedTagPools}
            onAdd={addTagPool}
            onUpdate={updateTagPool}
            onRemove={removeTagPool}
          />
        </div>
      {:else if activeTab === "gallery"}
        <div id="mb-panel-gallery" class="mb-panel" role="tabpanel" aria-labelledby="mb-tab-gallery">
          <div class="mb-subnav">
            <div class="mb-segmented" role="radiogroup" aria-label={label("lets-more-background.galleryTab", "题头图图库")}>
              <button
                type="button"
                role="radio"
                aria-checked={galleryView === "favorites"}
                onclick={() => (galleryView = "favorites")}
              >
                <Star class="size-3.5 shrink-0" aria-hidden="true" />
                <span>{label("lets-more-background.favoritesTabShort", "收藏")}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={galleryView === "history"}
                onclick={() => (galleryView = "history")}
              >
                <History class="size-3.5 shrink-0" aria-hidden="true" />
                <span>{label("lets-more-background.coverHistoryShort", "历史")}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={galleryView === "stash"}
                onclick={() => (galleryView = "stash")}
              >
                <Sparkles class="size-3.5 shrink-0" aria-hidden="true" />
                <span>{label("lets-more-background.stashTabShort", "暂存")}</span>
              </button>
            </div>
          </div>

          {#if galleryView === "favorites"}
            <CoverFavoritesTab {label} siteCredentials={normalizedCredentials} />
          {:else if galleryView === "stash"}
            <CoverStashTab {label} />
          {:else}
            <CoverHistoryTab {label} />
          {/if}
        </div>
      {:else}
        <div id="mb-panel-settings" class="mb-panel" role="tabpanel" aria-labelledby="mb-tab-settings">
          <div class="mb-subnav">
            <div class="mb-segmented" role="radiogroup" aria-label={label("lets-more-background.settingsTab", "基础与存储设置")}>
              <button
                type="button"
                role="radio"
                aria-checked={settingsView === "basic"}
                onclick={() => (settingsView = "basic")}
              >
                <SlidersHorizontal class="size-3.5 shrink-0" aria-hidden="true" />
                <span>{label("lets-more-background.basicTabShort", "基础")}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={settingsView === "cache"}
                onclick={() => (settingsView = "cache")}
              >
                <HardDrive class="size-3.5 shrink-0" aria-hidden="true" />
                <span>{label("lets-more-background.localCacheTabShort", "缓存")}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={settingsView === "access"}
                onclick={() => (settingsView = "access")}
              >
                <Key class="size-3.5 shrink-0" aria-hidden="true" />
                <span>{label("lets-more-background.credentialsTabShort", "凭据")}</span>
              </button>
            </div>
          </div>

          {#if settingsView === "basic"}
            <CoverBasicTab
              {label}
              {width}
              {height}
              {coverHistoryLimit}
              {coverSeenLimit}
              {gachaMode}
              {gachaDrawCount}
              {assetsLocation}
              {readFromAssets}
              {writeToAssets}
              {directDrag}
              {debugLogging}
              toolbarPosition={toolbarPosition === "adaptive" || toolbarPosition === "belowTags" ? "belowIcon" : toolbarPosition}
              {toolbarCustomX}
              {toolbarCustomY}
              {coverBreadcrumb}
              {coverDocumentMenu}
              {confirmRemoveCover}
              onBasicChange={handleBasicChange}
            />
          {:else if settingsView === "cache"}
            <CoverCacheTab
              {label}
              {localCache}
              {autoCacheLegacyCovers}
              {purgeCacheOnCoverChange}
              {localCacheRoot}
              {localCachePathTemplate}
              {localCacheMaxEdge}
              onBasicChange={handleBasicChange}
              {onMaintenance}
            />
          {:else}
            <CoverCredentialsTab
              {label}
              credentials={normalizedCredentials}
              onAdd={addCredential}
              onUpdate={updateCredential}
              onRemove={removeCredential}
            />
          {/if}
        </div>
      {/if}

      <!-- 题库 WorkspaceQuickBar 同款：导航作为滚动容器内最后一个 sticky 子元素，
           移动端吸底悬浮、桌面端 order 提到顶部。 -->
      <div class="mb-tabs" role="tablist" aria-label={title}>
        {#each tabs as tab (tab.id)}
          <button
            type="button"
            class="mb-tab"
            role="tab"
            id={`mb-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`mb-panel-${tab.id}`}
            onclick={() => (activeTab = tab.id)}
          >
            <svelte:component this={tab.icon} class="size-4 shrink-0" aria-hidden="true" />
            <span class="mb-tab-label">{tab.short}</span>
            {#if tab.count > 0}
              <span class="mb-tab-count">{tab.count}</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    {#if conditionMigrationOpen}
      <div class="mb-migration-backdrop" role="presentation" onclick={() => (conditionMigrationOpen = false)}></div>
      <div class="mb-migration-dialog" role="dialog" aria-modal="true" aria-labelledby="mb-migration-title">
        <header class="mb-migration-head">
          <strong id="mb-migration-title">{label("lets-more-background.conditionMigrationTitle", "筛选条件模型迁移")}</strong>
          <button type="button" class="mb-migration-close" aria-label={label("lets-more-background.cancel", "关闭")} onclick={() => (conditionMigrationOpen = false)}>
            <X class="size-4" aria-hidden="true" />
          </button>
        </header>
        <p class="mb-migration-desc">
          {label("lets-more-background.conditionMigrationBody", `检测到 ${legacyConditionTemplates.length} 个模板仍使用旧版扁平筛选条件。迁移为新的树形条件后筛选效果保持不变，并支持条件分组。`)}
        </p>
        <div class="mb-migration-list">
          {#each legacyConditionTemplates as tpl (tpl.id)}
            <div class="mb-migration-item">
              <strong class="mb-migration-item-name">{tpl.name}</strong>
              <!-- [条件图形视图-暂停维护] <div class="mb-migration-preview" aria-hidden="true">
                <ConditionGraph model={coverConditionToGraph(migrateLegacyCoverRules(tpl.rules ?? []), migrationGraphLabels)} height={200} />
              </div> -->
              <small class="mb-migration-item-count">{tpl.rules?.length ?? 0} {label("lets-more-background.conditionsSummaryRules", "条规则")}</small>
            </div>
          {/each}
        </div>
        <footer class="mb-migration-actions">
          <button type="button" class="mb-migration-btn" onclick={() => (conditionMigrationOpen = false)}>
            {label("lets-more-background.conditionMigrationLater", "稍后再说")}
          </button>
          <button type="button" class="mb-migration-btn primary" onclick={migrateAllConditions}>
            {label("lets-more-background.conditionMigrationNow", "立即迁移")}
          </button>
        </footer>
      </div>
    {/if}
  </div>
</div>
