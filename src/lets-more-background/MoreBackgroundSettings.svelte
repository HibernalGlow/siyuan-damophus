<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import {
    ArrowDown,
    ArrowUp,
    CheckCircle2,
    Database,
    Edit3,
    Eye,
    Key,
    Layers,
    Plus,
    RefreshCw,
    Search,
    Sliders,
    Sparkles,
    Trash2,
    Wand2,
    X,
    XCircle,
  } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import { Switch } from "@/components/ui/switch";
  import { Textarea } from "@/components/ui/textarea";
  import * as Tabs from "@/components/ui/tabs";
  import {
    DEFAULT_SITE_CREDENTIALS,
    DEFAULT_TAG_POOLS,
    DEFAULT_TEMPLATES,
    templateToUrl,
    type AspectRatioType,
    type CoverTemplateItem,
    type FilterRule,
    type SiteCredential,
    type TagEntry,
    type TagPool,
  } from "./sources";
  import {
    formatTagLine,
    parseTagLine,
  } from "./tag-dictionary";
  import {
    loadTagPoolsFromStorage,
    saveTagPoolsToStorage,
  } from "./tag-pool-storage";
  import {
    resolveBooruImageUrl,
    testBooruSiteCredential,
  } from "./booru";
  import { plugin } from "@/utils";

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
  export let mobile = false;

  const dispatch = createEventDispatcher();

  let activeTab = "templates";
  let testingTemplateId: string | null = null;
  let templateTestResults: Record<
    string,
    { success: boolean; url?: string; error?: string }
  > = {};

  let testingCredId: string | null = null;
  let credTestResults: Record<
    string,
    { success: boolean; message: string; sampleUrl?: string }
  > = {};

  // 词库批量编辑弹窗状态
  let editingPoolIndex: number | null = null;
  let editingPoolText = "";
  let editingPoolName = "";
  let editingPoolDesc = "";

  // 快速添加 tag 输入框
  let quickAddInputMap: Record<number, string> = {};
  let tagSearchQueryMap: Record<number, string> = {};

  function t(key: string, fallback?: string): string {
    return (plugin.i18n as any)[key] || fallback || key;
  }

  function normalizeTagItem(it: string | TagEntry): TagEntry {
    if (typeof it === "string") {
      const parsed = parseTagLine(it);
      return parsed ? { tag: parsed.tag, zh: parsed.zh } : { tag: it.trim() };
    }
    return it;
  }

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
    return generated;
  }

  $: normalizedTagPools = (tagPools && tagPools.length > 0 ? tagPools : DEFAULT_TAG_POOLS).map((p) => ({
    ...p,
    items: (p.items || []).map(normalizeTagItem),
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

  onMount(async () => {
    try {
      const loaded = await loadTagPoolsFromStorage();
      if (loaded && loaded.length > 0) {
        tagPools = loaded;
      }
    } catch (e) {
      console.warn("Failed to load tag pools from storage on mount:", e);
    }
  });

  function syncChanges(
    nextTemplates: CoverTemplateItem[],
    nextTagPools: TagPool[],
    nextCredentials: SiteCredential[],
  ) {
    templates = nextTemplates;
    tagPools = nextTagPools;
    siteCredentials = nextCredentials;

    // 独立保存庞大的画师和Tag词库到工作区独立数据库文件 (more_background_tag_pools.json)
    void saveTagPoolsToStorage(nextTagPools);

    const sources = nextTemplates.map((tpl) => ({
      label: tpl.name,
      url: templateToUrl(tpl, nextTagPools),
    }));

    dispatch("changed", { group, key: "templates", value: nextTemplates });
    dispatch("changed", { group, key: "siteCredentials", value: nextCredentials });
    dispatch("changed", { group, key: "sources", value: sources });
  }

  // --- Tag Pools Logic ---
  function addTagPool() {
    const newPool: TagPool = {
      id: `pool-${Date.now()}`,
      name: `新画师/Tag词库 ${normalizedTagPools.length + 1}`,
      description: "自定义画师名单或标签集合",
      items: [],
    };
    syncChanges(normalizedTemplates, [...normalizedTagPools, newPool], normalizedCredentials);
    openPoolEditor(normalizedTagPools.length);
  }

  function updateTagPool(index: number, patch: Partial<TagPool>) {
    const next = normalizedTagPools.map((item, i) =>
      i === index ? { ...item, ...patch } : item,
    );
    syncChanges(normalizedTemplates, next, normalizedCredentials);
  }

  function removeTagPool(index: number) {
    const next = normalizedTagPools.filter((_, i) => i !== index);
    syncChanges(normalizedTemplates, next, normalizedCredentials);
  }

  function removeTagFromPool(poolIndex: number, tagIndex: number) {
    const pool = normalizedTagPools[poolIndex];
    if (!pool) return;
    const nextItems = pool.items.filter((_, i) => i !== tagIndex);
    updateTagPool(poolIndex, { items: nextItems });
  }

  function quickAddTag(poolIndex: number) {
    const inputVal = (quickAddInputMap[poolIndex] || "").trim();
    if (!inputVal) return;
    const parsed = parseTagLine(inputVal);
    if (!parsed) return;

    const pool = normalizedTagPools[poolIndex];
    const nextItems = [...(pool.items || []), { tag: parsed.tag, zh: parsed.zh }];
    updateTagPool(poolIndex, { items: nextItems });
    quickAddInputMap[poolIndex] = "";
    quickAddInputMap = { ...quickAddInputMap };
  }

  function openPoolEditor(poolIndex: number) {
    const pool = normalizedTagPools[poolIndex];
    if (!pool) return;
    editingPoolIndex = poolIndex;
    editingPoolName = pool.name;
    editingPoolDesc = pool.description || "";
    editingPoolText = (pool.items || [])
      .map((it) => (typeof it === "string" ? it : formatTagLine(it.tag, it.zh)))
      .join("\n");
  }

  function closePoolEditor() {
    editingPoolIndex = null;
  }

  function savePoolEditor() {
    if (editingPoolIndex === null) return;
    const lines = editingPoolText.split("\n");
    const parsedItems: TagEntry[] = [];
    for (const l of lines) {
      const p = parseTagLine(l);
      if (p) parsedItems.push({ tag: p.tag, zh: p.zh });
    }

    updateTagPool(editingPoolIndex, {
      name: editingPoolName.trim() || `词库 ${editingPoolIndex + 1}`,
      description: editingPoolDesc.trim(),
      items: parsedItems,
    });
    closePoolEditor();
  }

  function autoTranslateEditorText() {
    const lines = editingPoolText.split("\n");
    const newLines = lines.map((l) => {
      const p = parseTagLine(l);
      if (!p) return l;
      return formatTagLine(p.tag, p.zh);
    });
    editingPoolText = newLines.join("\n");
  }

  // --- Template Rules & Query Builder Logic ---
  function addTemplate() {
    const newTpl: CoverTemplateItem = {
      id: `tpl-${Date.now()}`,
      name: `新条件模板 ${normalizedTemplates.length + 1}`,
      type: "booru",
      site: "safebooru.org",
      aspectRatio: "landscape",
      rating: "safe",
      tags: "wallpaper",
      poolId: normalizedTagPools[0]?.id || undefined,
      rules: [
        { id: `r1-${Date.now()}`, field: "aspectRatio", operator: "equals", value: "landscape" },
        { id: `r2-${Date.now()}`, field: "tagPool", operator: "randomIn", value: normalizedTagPools[0]?.id || "" },
        { id: `r3-${Date.now()}`, field: "site", operator: "equals", value: "safebooru.org" },
      ],
    };
    syncChanges([...normalizedTemplates, newTpl], normalizedTagPools, normalizedCredentials);
  }

  function updateTemplate(index: number, patch: Partial<CoverTemplateItem>) {
    const next = normalizedTemplates.map((item, i) =>
      i === index ? { ...item, ...patch } : item,
    );
    syncChanges(next, normalizedTagPools, normalizedCredentials);
  }

  function removeTemplate(index: number) {
    const next = normalizedTemplates.filter((_, i) => i !== index);
    syncChanges(next, normalizedTagPools, normalizedCredentials);
  }

  function moveTemplate(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= normalizedTemplates.length) return;
    const next = [...normalizedTemplates];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    syncChanges(next, normalizedTagPools, normalizedCredentials);
  }

  function resetDefaults() {
    syncChanges(DEFAULT_TEMPLATES, DEFAULT_TAG_POOLS, normalizedCredentials);
  }

  // --- Filter Rules Sub-Editor inside Template ---
  function addRuleToTemplate(tplIndex: number, field: FilterRule["field"] = "aspectRatio") {
    const tpl = normalizedTemplates[tplIndex];
    const currentRules = tpl.rules || [];
    let defaultVal: any = "landscape";
    let defaultOp: FilterRule["operator"] = "equals";

    if (field === "tagPool") {
      defaultVal = normalizedTagPools[0]?.id || "";
      defaultOp = "randomIn";
    } else if (field === "site") {
      defaultVal = "safebooru.org";
    } else if (field === "rating") {
      defaultVal = "safe";
    } else if (field === "tags") {
      defaultVal = "wallpaper";
      defaultOp = "contains";
    } else if (field === "minScore") {
      defaultVal = 5;
      defaultOp = "gte";
    }

    const newRule: FilterRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      field,
      operator: defaultOp,
      value: defaultVal,
    };

    const nextRules = [...currentRules, newRule];
    applyRulesToTemplate(tplIndex, nextRules);
  }

  function removeRuleFromTemplate(tplIndex: number, ruleIndex: number) {
    const tpl = normalizedTemplates[tplIndex];
    const nextRules = (tpl.rules || []).filter((_, i) => i !== ruleIndex);
    applyRulesToTemplate(tplIndex, nextRules);
  }

  function updateRuleInTemplate(
    tplIndex: number,
    ruleIndex: number,
    patch: Partial<FilterRule>,
  ) {
    const tpl = normalizedTemplates[tplIndex];
    const nextRules = (tpl.rules || []).map((r, i) =>
      i === ruleIndex ? { ...r, ...patch } : r,
    );
    applyRulesToTemplate(tplIndex, nextRules);
  }

  function applyRulesToTemplate(tplIndex: number, rules: FilterRule[]) {
    const patch: Partial<CoverTemplateItem> = { rules };
    for (const r of rules) {
      if (r.field === "aspectRatio") patch.aspectRatio = r.value;
      if (r.field === "site") patch.site = r.value;
      if (r.field === "rating") patch.rating = r.value;
      if (r.field === "tags") patch.tags = r.value;
      if (r.field === "minScore") patch.minScore = Number(r.value) || undefined;
      if (r.field === "tagPool") patch.poolId = r.value;
    }
    updateTemplate(tplIndex, patch);
  }

  async function testTemplate(template: CoverTemplateItem) {
    testingTemplateId = template.id;
    templateTestResults[template.id] = undefined as any;
    try {
      const url = templateToUrl(template, normalizedTagPools);
      const res = await resolveBooruImageUrl(url, normalizedCredentials);
      if (res) {
        templateTestResults[template.id] = { success: true, url: res };
      } else {
        templateTestResults[template.id] = {
          success: false,
          error: t("lets-more-background.testFailed", "No matching image found or network error"),
        };
      }
    } catch (e: any) {
      templateTestResults[template.id] = {
        success: false,
        error: e?.message || String(e),
      };
    } finally {
      testingTemplateId = null;
      templateTestResults = { ...templateTestResults };
    }
  }

  // --- Credentials Logic ---
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
    const next = normalizedCredentials.map((item, i) =>
      i === index ? { ...item, ...patch } : item,
    );
    syncChanges(normalizedTemplates, normalizedTagPools, next);
  }

  function removeCredential(index: number) {
    const next = normalizedCredentials.filter((_, i) => i !== index);
    syncChanges(normalizedTemplates, normalizedTagPools, next);
  }

  async function testCredentialItem(cred: SiteCredential) {
    testingCredId = cred.id;
    credTestResults[cred.id] = undefined as any;
    try {
      const res = await testBooruSiteCredential(cred.site, cred.login, cred.apiKey);
      credTestResults[cred.id] = res;
    } catch (e: any) {
      credTestResults[cred.id] = {
        success: false,
        message: e?.message || String(e),
      };
    } finally {
      testingCredId = null;
      credTestResults = { ...credTestResults };
    }
  }

  function handleBasicChange(key: string, value: unknown) {
    dispatch("changed", { group, key, value });
  }

  const RATIO_OPTIONS: { id: AspectRatioType; label: string; desc: string }[] = [
    { id: "landscape", label: "🖼️ 横屏 (>= 1.0)", desc: "ratio >= 1.0 (推荐题头图)" },
    { id: "wide", label: "📐 宽屏 (>= 1.33)", desc: "ratio >= 1.33 (超宽横幅)" },
    { id: "portrait", label: "📱 竖屏 (< 1.0)", desc: "ratio < 1.0" },
    { id: "any", label: "🔄 任意比例", desc: "不限制比例" },
  ];

  const BOORU_SITES = [
    { id: "safebooru.org", label: "Safebooru (独立站·公开免密·推荐)" },
    { id: "safebooru.donmai.us", label: "Safebooru (Danbooru 安全镜像·支持 API Key)" },
    { id: "danbooru.donmai.us", label: "Danbooru (主站·支持 API Key)" },
    { id: "yande.re", label: "Yande.re (高清插画壁纸)" },
    { id: "konachan.com", label: "Konachan (壁纸专区)" },
    { id: "gelbooru.com", label: "Gelbooru (海量图库·支持 API Key)" },
    { id: "e621.net", label: "E621 (支持 API Key)" },
    { id: "tbib.org", label: "TBIB (The Big ImageBoard)" },
  ];

  const RULE_FIELDS = [
    { id: "aspectRatio", label: "🖼️ 画面比例 (Aspect Ratio)" },
    { id: "tagPool", label: "🎨 随机抽选词库池 (Tag Pool)" },
    { id: "site", label: "🌐 目标站点 (Site)" },
    { id: "rating", label: "🛡️ 安全分级 (Rating)" },
    { id: "tags", label: "🏷️ 固定标签 (Fixed Tags)" },
    { id: "minScore", label: "⭐ 最低评分 (Min Score)" },
  ];
</script>

<div class="more-background-settings flex flex-col gap-5 p-1 relative" class:mobile>
  <header class="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
    <div>
      <div class="text-lg font-semibold" role="heading" aria-level="2">
        {title}
      </div>
      <p class="mt-1 text-xs text-muted-foreground">
        {t("lets-more-background.description")}
      </p>
    </div>
  </header>

  <Tabs.Root bind:value={activeTab} class="w-full">
    <Tabs.List class="grid w-full grid-cols-4 max-w-2xl">
      <Tabs.Trigger value="templates" class="gap-1.5 text-xs">
        <Layers class="size-3.5" />
        {t("lets-more-background.templatesTab", "条件模板与过滤器")}
      </Tabs.Trigger>
      <Tabs.Trigger value="tagPools" class="gap-1.5 text-xs">
        <Database class="size-3.5" />
        {t("lets-more-background.tagPoolsTab", "Tag / 画师词库池")}
      </Tabs.Trigger>
      <Tabs.Trigger value="credentials" class="gap-1.5 text-xs">
        <Key class="size-3.5" />
        {t("lets-more-background.credentialsTab", "多站点 API 凭据")}
      </Tabs.Trigger>
      <Tabs.Trigger value="basic" class="gap-1.5 text-xs">
        <Sliders class="size-3.5" />
        {t("lets-more-background.basicTab", "基础设置")}
      </Tabs.Trigger>
    </Tabs.List>

    <!-- Tab 1: 条件模板与 Query Builder 过滤器 -->
    <Tabs.Content value="templates" class="mt-4 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="text-xs text-muted-foreground">
          已配置 <span class="font-semibold text-foreground">{normalizedTemplates.length}</span> 个条件模板。每个模板可自由组合过滤条件与画师词库。
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" onclick={resetDefaults} class="text-xs">
            <RefreshCw class="size-3.5 mr-1" />
            恢复预设
          </Button>
          <Button size="sm" onclick={addTemplate} class="text-xs">
            <Plus class="size-3.5 mr-1" />
            {t("lets-more-background.addTemplate", "添加新模板")}
          </Button>
        </div>
      </div>

      <div class="space-y-4">
        {#each normalizedTemplates as template, tplIndex (template.id || tplIndex)}
          <div class="rounded-lg border border-border bg-card/60 p-4 shadow-sm transition-all hover:border-border/80">
            <!-- 模板卡片顶部栏 -->
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
              <div class="flex flex-1 items-center gap-2 min-w-[240px]">
                <Sparkles class="size-4 text-primary shrink-0" />
                <Input
                  bind:value={template.name}
                  oninput={() => updateTemplate(tplIndex, { name: template.name })}
                  placeholder={t("lets-more-background.templateName", "模板名称")}
                  class="font-medium text-sm h-8"
                />
              </div>

              <!-- 排序与删除 -->
              <div class="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={tplIndex === 0}
                  onclick={() => moveTemplate(tplIndex, "up")}
                  title="上移"
                >
                  <ArrowUp class="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={tplIndex === normalizedTemplates.length - 1}
                  onclick={() => moveTemplate(tplIndex, "down")}
                  title="下移"
                >
                  <ArrowDown class="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="text-destructive hover:bg-destructive/10"
                  onclick={() => removeTemplate(tplIndex)}
                  title="删除"
                >
                  <Trash2 class="size-3.5" />
                </Button>
              </div>
            </div>

            <!-- 图源类型选择 -->
            <div class="mt-3 text-xs">
              <div class="flex flex-wrap items-center gap-4 mb-3">
                <span class="font-medium text-muted-foreground w-20">图源类型:</span>
                <div class="flex flex-wrap items-center gap-3">
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`type-${template.id}`}
                      value="booru"
                      checked={template.type === "booru"}
                      onchange={() => updateTemplate(tplIndex, { type: "booru" })}
                      class="text-primary"
                    />
                    <span class="font-medium">🎨 Booru 条件过滤器 (Query Builder)</span>
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`type-${template.id}`}
                      value="preset_api"
                      checked={template.type === "preset_api"}
                      onchange={() => updateTemplate(tplIndex, { type: "preset_api" })}
                      class="text-primary"
                    />
                    <span>🌍 经典在线 API</span>
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`type-${template.id}`}
                      value="custom_url"
                      checked={template.type === "custom_url"}
                      onchange={() => updateTemplate(tplIndex, { type: "custom_url" })}
                      class="text-primary"
                    />
                    <span>🔗 直接 URL</span>
                  </label>
                </div>
              </div>

              {#if template.type === "booru"}
                <!-- Query Builder 规则构建区域 -->
                <div class="rounded-md border border-border/80 bg-background/60 p-3 space-y-3">
                  <div class="flex items-center justify-between border-b border-border/40 pb-2">
                    <div class="font-medium text-foreground flex items-center gap-1.5">
                      <Sliders class="size-3.5 text-primary" />
                      <span>过滤规则列表 (Filter Rules)</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <select
                        class="rounded border border-input bg-background px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-primary font-medium"
                        onchange={(e) => {
                          const selectEl = e.currentTarget as HTMLSelectElement;
                          const val = selectEl.value as any;
                          if (val) {
                            addRuleToTemplate(tplIndex, val);
                            selectEl.value = "";
                          }
                        }}
                      >
                        <option value="">+ 添加条件规则...</option>
                        {#each RULE_FIELDS as f}
                          <option value={f.id}>{f.label}</option>
                        {/each}
                      </select>
                    </div>
                  </div>

                  <!-- 规则行列表 -->
                  <div class="space-y-2">
                    {#if !template.rules || template.rules.length === 0}
                      <div class="text-xs text-muted-foreground p-2 text-center bg-muted/20 rounded">
                        暂无具体规则，点击右上角「+ 添加条件规则」添加。
                      </div>
                    {:else}
                      {#each template.rules as rule, rIndex (rule.id || rIndex)}
                        <div class="flex flex-wrap items-center gap-2 rounded bg-muted/30 p-2.5 border border-border/50 text-xs">
                          <!-- 字段名 -->
                          <div class="w-40 font-medium text-foreground truncate shrink-0 flex items-center gap-1">
                            {RULE_FIELDS.find((f) => f.id === rule.field)?.label || rule.field}
                          </div>

                          <!-- 关系/操作符 -->
                          <span class="text-muted-foreground font-mono text-[11px] px-2 py-0.5 rounded bg-muted/80 shrink-0">
                            {rule.operator === "randomIn"
                              ? "random in"
                              : rule.operator === "contains"
                              ? "contains"
                              : rule.operator === "gte"
                              ? ">="
                              : "="}
                          </span>

                          <!-- 目标值编辑 -->
                          <div class="flex-1 min-w-[200px]">
                            {#if rule.field === "aspectRatio"}
                              <select
                                value={rule.value || "landscape"}
                                onchange={(e) => updateRuleInTemplate(tplIndex, rIndex, { value: (e.target as any).value })}
                                class="w-full rounded border border-input bg-background px-2.5 py-1 text-xs focus:outline-none font-medium"
                              >
                                {#each RATIO_OPTIONS as opt}
                                  <option value={opt.id}>{opt.label} - {opt.desc}</option>
                                {/each}
                              </select>
                            {:else if rule.field === "tagPool"}
                              <select
                                value={rule.value || normalizedTagPools[0]?.id}
                                onchange={(e) => updateRuleInTemplate(tplIndex, rIndex, { value: (e.target as any).value })}
                                class="w-full rounded border border-input bg-background px-2.5 py-1 text-xs focus:outline-none text-primary font-medium"
                              >
                                {#each normalizedTagPools as pool}
                                  <option value={pool.id}>
                                    {pool.name} (共 {pool.items?.length || 0} 个词条)
                                  </option>
                                {/each}
                              </select>
                            {:else if rule.field === "site"}
                              <select
                                value={rule.value || "safebooru.org"}
                                onchange={(e) => updateRuleInTemplate(tplIndex, rIndex, { value: (e.target as any).value })}
                                class="w-full rounded border border-input bg-background px-2.5 py-1 text-xs focus:outline-none font-medium"
                              >
                                {#each BOORU_SITES as s}
                                  <option value={s.id}>{s.label}</option>
                                {/each}
                              </select>
                            {:else if rule.field === "rating"}
                              <select
                                value={rule.value || "safe"}
                                onchange={(e) => updateRuleInTemplate(tplIndex, rIndex, { value: (e.target as any).value })}
                                class="w-full rounded border border-input bg-background px-2.5 py-1 text-xs focus:outline-none font-medium"
                              >
                                <option value="safe">Safe (仅安全·适合日常)</option>
                                <option value="general">General (通用)</option>
                                <option value="questionable">Questionable (性感)</option>
                                <option value="all">All (包含全部)</option>
                              </select>
                            {:else if rule.field === "minScore"}
                              <Input
                                type="number"
                                value={rule.value}
                                oninput={(e) => updateRuleInTemplate(tplIndex, rIndex, { value: parseInt((e.target as HTMLInputElement).value, 10) || 0 })}
                                placeholder="例如 5"
                                class="h-7 text-xs"
                              />
                            {:else}
                              <Input
                                value={rule.value || ""}
                                oninput={(e) => updateRuleInTemplate(tplIndex, rIndex, { value: (e.target as HTMLInputElement).value })}
                                placeholder="wallpaper scenery"
                                class="h-7 text-xs font-mono"
                              />
                            {/if}
                          </div>

                          <!-- 删除规则按钮 -->
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            class="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onclick={() => removeRuleFromTemplate(tplIndex, rIndex)}
                            title="删除此规则"
                          >
                            <Trash2 class="size-3.5" />
                          </Button>
                        </div>
                      {/each}
                    {/if}
                  </div>
                </div>
              {:else}
                <div>
                  <Label class="text-xs text-muted-foreground mb-1 block">图片 URL / API 链接</Label>
                  <Input
                    bind:value={template.url}
                    oninput={() => updateTemplate(tplIndex, { url: template.url })}
                    placeholder="https://..."
                    class="h-8 text-xs font-mono"
                  />
                  <p class="text-[11px] text-muted-foreground mt-1">
                    支持 <code>&#123;width&#125;</code> 与 <code>&#123;height&#125;</code> 尺寸占位符。
                  </p>
                </div>
              {/if}

              <!-- 卡片底部：测试出图按钮与实时预览 -->
              <div class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 p-2.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={testingTemplateId === template.id}
                  onclick={() => testTemplate(template)}
                  class="text-xs h-7 gap-1"
                >
                  <Eye class="size-3.5" />
                  {testingTemplateId === template.id ? t("lets-more-background.testing") : t("lets-more-background.testTemplateBtn")}
                </Button>

                {#if templateTestResults[template.id]}
                  {#if templateTestResults[template.id].success}
                    <div class="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                      <CheckCircle2 class="size-4" />
                      <span>{t("lets-more-background.testSuccess")}</span>
                    </div>
                  {:else}
                    <div class="flex items-center gap-1.5 text-xs text-destructive font-medium">
                      <XCircle class="size-4" />
                      <span>{templateTestResults[template.id].error}</span>
                    </div>
                  {/if}
                {/if}
              </div>

              <!-- 测试成功后的预览图 -->
              {#if templateTestResults[template.id]?.url}
                <div class="mt-2 rounded-lg border border-border/80 overflow-hidden bg-black/5 p-2">
                  <div class="text-[11px] text-muted-foreground mb-1.5 flex items-center justify-between">
                    <span>{t("lets-more-background.previewImage")}</span>
                    <a
                      href={templateTestResults[template.id].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-primary hover:underline"
                    >
                      查看高清大图 ↗
                    </a>
                  </div>
                  <img
                    src={templateTestResults[template.id].url}
                    alt="Preview"
                    class="max-h-48 w-full object-cover rounded-md border"
                  />
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </Tabs.Content>

    <!-- Tab 2: 独立 Tag / 画师词库池管理 (美观的标签胶囊网格 + 专属编辑窗口) -->
    <Tabs.Content value="tagPools" class="mt-4 space-y-4">
      <div class="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground border border-border">
        <div class="font-medium text-foreground mb-1 flex items-center gap-1.5">
          <Database class="size-4 text-primary" />
          {t("lets-more-background.tagPoolsTitle")}
        </div>
        {t("lets-more-background.tagPoolsDesc")}
      </div>

      <div class="flex justify-end">
        <Button size="sm" onclick={addTagPool} class="text-xs gap-1">
          <Plus class="size-3.5" />
          {t("lets-more-background.addTagPool", "创建新词库池")}
        </Button>
      </div>

      <div class="space-y-4">
        {#each normalizedTagPools as pool, poolIndex (pool.id || poolIndex)}
          {@const searchQ = (tagSearchQueryMap[poolIndex] || "").toLowerCase()}
          {@const filteredItems = (pool.items || []).filter((it) => {
            if (!searchQ) return true;
            const entry = normalizeTagItem(it);
            return (
              entry.tag.toLowerCase().includes(searchQ) ||
              (entry.zh && entry.zh.toLowerCase().includes(searchQ))
            );
          })}

          <div class="rounded-lg border border-border bg-card/60 p-4 space-y-3 shadow-sm hover:border-border/80 transition-all">
            <!-- 词库头部 -->
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-2.5">
              <div class="flex-1 min-w-[200px] flex items-center gap-2">
                <Sparkles class="size-4 text-primary shrink-0" />
                <span class="font-semibold text-sm text-foreground">{pool.name}</span>
                <span class="text-xs text-muted-foreground">({pool.description || "无备注"})</span>
              </div>

              <div class="flex items-center gap-2">
                <span class="text-xs text-muted-foreground">
                  共 <strong class="text-foreground">{pool.items?.length || 0}</strong> 个词条
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-7 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/10"
                  onclick={() => openPoolEditor(poolIndex)}
                >
                  <Edit3 class="size-3.5" />
                  编辑 / 批量导入
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="text-destructive hover:bg-destructive/10 size-7"
                  onclick={() => removeTagPool(poolIndex)}
                  title="删除词库"
                >
                  <Trash2 class="size-3.5" />
                </Button>
              </div>
            </div>

            <!-- 搜索与快速添加工具栏 -->
            <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
              <!-- 快捷搜索 -->
              <div class="relative w-48">
                <Search class="size-3.5 absolute left-2.5 top-2 text-muted-foreground" />
                <Input
                  bind:value={tagSearchQueryMap[poolIndex]}
                  placeholder="过滤词条..."
                  class="h-7 text-xs pl-7"
                />
              </div>

              <!-- 快捷单个添加 -->
              <div class="flex items-center gap-1.5 flex-1 max-w-md justify-end">
                <Input
                  bind:value={quickAddInputMap[poolIndex]}
                  onkeydown={(e) => { if (e.key === "Enter") quickAddTag(poolIndex); }}
                  placeholder="输入新画师或Tag (如 ask_(askzy) # Ask)..."
                  class="h-7 text-xs"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  class="h-7 text-xs shrink-0"
                  onclick={() => quickAddTag(poolIndex)}
                >
                  + 添加
                </Button>
              </div>
            </div>

            <!-- 优雅的中英文 Tag 徽章胶囊网格 -->
            <div class="min-h-16 rounded-md bg-muted/20 p-3 border border-border/40">
              {#if filteredItems.length === 0}
                <div class="text-xs text-muted-foreground text-center py-4">
                  {pool.items?.length === 0 ? "词库暂无词条，点击右上角「编辑 / 批量导入」一键粘贴" : "无匹配词条"}
                </div>
              {:else}
                <div class="flex flex-wrap gap-2">
                  {#each filteredItems as item, itemIdx (itemIdx)}
                    {@const entry = normalizeTagItem(item)}
                    <div class="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-1 text-xs shadow-2xs hover:border-primary/60 transition-colors group">
                      <span class="font-mono text-[11px] text-foreground font-medium">{entry.tag}</span>
                      {#if entry.zh}
                        <span class="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] text-primary font-medium">
                          {entry.zh}
                        </span>
                      {/if}
                      <button
                        type="button"
                        class="text-muted-foreground/60 hover:text-destructive transition-colors ml-0.5"
                        onclick={() => removeTagFromPool(poolIndex, itemIdx)}
                        title="删除此Tag"
                      >
                        <X class="size-3" />
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </Tabs.Content>

    <!-- Tab 3: 多站点 API 凭据 -->
    <Tabs.Content value="credentials" class="mt-4 space-y-4">
      <div class="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground border border-border">
        <div class="font-medium text-foreground mb-1 flex items-center gap-1.5">
          <Key class="size-4 text-primary" />
          {t("lets-more-background.credentialsTitle")}
        </div>
        {t("lets-more-background.credentialsDescription")}
      </div>

      <div class="flex justify-end">
        <Button size="sm" onclick={addCredential} class="text-xs gap-1">
          <Plus class="size-3.5" />
          {t("lets-more-background.addCredential")}
        </Button>
      </div>

      <div class="space-y-3">
        {#each normalizedCredentials as cred, index (cred.id || index)}
          <div class="rounded-lg border border-border bg-card/60 p-3.5 text-xs shadow-sm">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label class="text-xs text-muted-foreground mb-1 block">站点域名 (Site Domain)</Label>
                <Input
                  bind:value={cred.site}
                  oninput={() => updateCredential(index, { site: cred.site })}
                  placeholder="danbooru.donmai.us"
                  class="h-8 text-xs"
                />
              </div>

              <div>
                <Label class="text-xs text-muted-foreground mb-1 block">用户名 / Login ID</Label>
                <Input
                  bind:value={cred.login}
                  oninput={() => updateCredential(index, { login: cred.login })}
                  placeholder="您的登录名 / User ID"
                  class="h-8 text-xs"
                />
              </div>

              <div>
                <Label class="text-xs text-muted-foreground mb-1 block">API Key 密钥</Label>
                <Input
                  type="password"
                  bind:value={cred.apiKey}
                  oninput={() => updateCredential(index, { apiKey: cred.apiKey })}
                  placeholder="API Key / Token"
                  class="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2.5">
              <Button
                variant="outline"
                size="sm"
                disabled={testingCredId === cred.id}
                onclick={() => testCredentialItem(cred)}
                class="text-xs h-7"
              >
                {testingCredId === cred.id ? "测试中..." : "🧪 测试此站点连接"}
              </Button>

              {#if credTestResults[cred.id]}
                <div
                  class="text-xs font-medium flex items-center gap-1.5"
                  class:text-emerald-600={credTestResults[cred.id].success}
                  class:text-destructive={!credTestResults[cred.id].success}
                >
                  {#if credTestResults[cred.id].success}
                    <CheckCircle2 class="size-3.5" />
                  {:else}
                    <XCircle class="size-3.5" />
                  {/if}
                  <span>{credTestResults[cred.id].message}</span>
                </div>
              {/if}

              <Button
                variant="ghost"
                size="sm"
                class="text-destructive hover:bg-destructive/10 h-7 text-xs"
                onclick={() => removeCredential(index)}
              >
                <Trash2 class="size-3.5 mr-1" />
                删除
              </Button>
            </div>
          </div>
        {/each}
      </div>
    </Tabs.Content>

    <!-- Tab 4: 基础设置 -->
    <Tabs.Content value="basic" class="mt-4 space-y-4">
      <div class="rounded-lg border border-border bg-card/60 p-4 space-y-4 text-xs">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label class="text-xs font-medium mb-1 block">{t("lets-more-background.widthTitle")}</Label>
            <Input
              type="number"
              value={width}
              oninput={(e) => handleBasicChange("width", parseInt((e.target as HTMLInputElement).value, 10) || 1920)}
              class="h-8 text-xs"
            />
            <p class="text-[11px] text-muted-foreground mt-1">{t("lets-more-background.widthDescription")}</p>
          </div>

          <div>
            <Label class="text-xs font-medium mb-1 block">{t("lets-more-background.heightTitle")}</Label>
            <Input
              type="number"
              value={height}
              oninput={(e) => handleBasicChange("height", parseInt((e.target as HTMLInputElement).value, 10) || 1080)}
              class="h-8 text-xs"
            />
            <p class="text-[11px] text-muted-foreground mt-1">{t("lets-more-background.heightDescription")}</p>
          </div>
        </div>

        <div class="border-t border-border/60 pt-3">
          <Label class="text-xs font-medium mb-1 block">{t("lets-more-background.assetsLocationTitle")}</Label>
          <Input
            value={assetsLocation}
            oninput={(e) => handleBasicChange("assetsLocation", (e.target as HTMLInputElement).value)}
            class="h-8 text-xs font-mono"
          />
          <p class="text-[11px] text-muted-foreground mt-1">{t("lets-more-background.assetsLocationDescription")}</p>
        </div>

        <div class="border-t border-border/60 pt-3 flex items-center justify-between">
          <div>
            <div class="font-medium text-foreground">{t("lets-more-background.readFromAssetsTitle")}</div>
            <p class="text-[11px] text-muted-foreground">{t("lets-more-background.readFromAssetsDescription")}</p>
          </div>
          <Switch
            checked={readFromAssets}
            onCheckedChange={(val) => handleBasicChange("readFromAssets", val)}
          />
        </div>

        <div class="border-t border-border/60 pt-3 flex items-center justify-between">
          <div>
            <div class="font-medium text-foreground">{t("lets-more-background.writeToAssetsTitle")}</div>
            <p class="text-[11px] text-muted-foreground">{t("lets-more-background.writeToAssetsDescription")}</p>
          </div>
          <Switch
            checked={writeToAssets}
            onCheckedChange={(val) => handleBasicChange("writeToAssets", val)}
          />
        </div>
      </div>
    </Tabs.Content>
  </Tabs.Root>

  <!-- 专门的 Tag 词库批量编辑 / 导入 弹窗窗口 (Modal Drawer) -->
  {#if editingPoolIndex !== null}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div class="w-full max-w-2xl rounded-xl border border-border bg-card shadow-2xl p-5 space-y-4 max-h-[90vh] flex flex-col">
        <!-- 弹窗头部 -->
        <div class="flex items-center justify-between border-b border-border/60 pb-3">
          <div class="flex items-center gap-2">
            <Edit3 class="size-4 text-primary" />
            <h3 class="font-semibold text-sm">编辑画师/Tag 词库</h3>
          </div>
          <Button variant="ghost" size="icon-sm" class="size-7" onclick={closePoolEditor}>
            <X class="size-4" />
          </Button>
        </div>

        <!-- 基础信息 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <Label class="text-xs text-muted-foreground mb-1 block">词库名称</Label>
            <Input bind:value={editingPoolName} placeholder="例如：🎨 常用精选画师池" class="h-8 text-xs" />
          </div>
          <div>
            <Label class="text-xs text-muted-foreground mb-1 block">描述 / 备注</Label>
            <Input bind:value={editingPoolDesc} placeholder="例如：高画质动漫插画画师" class="h-8 text-xs" />
          </div>
        </div>

        <!-- 多行编辑区域 -->
        <div class="flex-1 flex flex-col min-h-[220px]">
          <div class="flex items-center justify-between mb-1.5">
            <Label class="text-xs text-muted-foreground">
              词条清单 (每行一个，支持 <code>tag # 中文名</code> 或直接粘贴外部清单)
            </Label>
            <Button
              variant="outline"
              size="sm"
              class="h-6 text-[11px] gap-1 text-primary border-primary/30"
              onclick={autoTranslateEditorText}
            >
              <Wand2 class="size-3" />
              一键智能匹配中文翻译
            </Button>
          </div>
          <Textarea
            bind:value={editingPoolText}
            rows={10}
            class="flex-1 font-mono text-xs leading-relaxed"
            placeholder="ask_(askzy) # Ask (画师)&#10;blade_(galaxist) # Blade (画师)&#10;scenery # 唯美风景&#10;night_sky # 璀璨夜空"
          />
        </div>

        <!-- 底部按钮 -->
        <div class="flex items-center justify-end gap-2 border-t border-border/60 pt-3">
          <Button variant="ghost" size="sm" class="text-xs" onclick={closePoolEditor}>
            取消
          </Button>
          <Button size="sm" class="text-xs gap-1" onclick={savePoolEditor}>
            <CheckCircle2 class="size-3.5" />
            保存词库
          </Button>
        </div>
      </div>
    </div>
  {/if}
</div>
