<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import { flip } from "svelte/animate";
  import { dragHandle, dragHandleZone, type DndEvent } from "svelte-dnd-action";
  import {
    ArrowDown,
    ArrowUp,
    Check,
    CheckCircle2,
    Copy,
    Database,
    Download,
    Edit3,
    ExternalLink,
    Eye,
    FileJson,
    Globe,
    GripVertical,
    Image,
    Key,
    Layers,
    Link2,
    Loader2,
    Palette,
    Plus,
    RefreshCw,
    Search,
    Sliders,
    SlidersHorizontal,
    Sparkles,
    Tag,
    Trash2,
    Upload,
    Wand2,
    X,
    XCircle,
  } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Badge } from "@/components/ui/badge";
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
    fetchImageForPreview,
    resolveBooruImageInfo,
    testBooruSiteCredential,
  } from "./booru";
  import { openCoverTagViewer } from "./tag-viewer";
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
  export let localCacheRoot = "/storage/petal/siyuan-damophus/more-background/covers";
  export let localCachePathTemplate = "{year}/{month}/{hash}.webp";
  export let localCacheMaxEdge: "none" | "1280" | "1920" | "2560" = "1920";
  export let directDrag = false;
  export let toolbarPosition: "adaptive" | "belowTags" | "belowIcon" | "native" | "custom" = "adaptive";
  export let toolbarCustomX = 50;
  export let toolbarCustomY = 15;
  export let coverBreadcrumb = false;
  export let coverDocumentMenu = false;
  export let mobile = false;

  const dispatch = createEventDispatcher();

  let activeTab = "templates";
  let testingTemplateId: string | null = null;
  let templateTestResults: Record<
    string,
    { success: boolean; url?: string; error?: string; displayUrl?: string; postUrl?: string; postId?: string | number; site?: string; width?: number; height?: number; score?: number; tags?: string[] | string }
  > = {};
  let templateImageLoadErrors: Record<string, boolean> = {};

  let testingCredId: string | null = null;
  let credTestResults: Record<
    string,
    { success: boolean; message: string; samplePostUrl?: string }
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
    if (tpl.blacklist) {
      generated.push({ id: `r-bl-${tpl.id}`, field: "blacklist", operator: "containsNone", value: tpl.blacklist });
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

  // --- 实时保存状态跟踪与动画反馈 ---
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
      // 1. 独立保存庞大的画师和Tag词库到工作区独立数据库文件 (more_background_tag_pools.json)
      await saveTagPoolsToStorage(nextTagPools);

      const sources = nextTemplates.map((tpl) => ({
        label: tpl.name,
        url: templateToUrl(tpl, nextTagPools),
      }));

      // 2. 实时持久化写入思源笔记数据库 (damophus-settings.json)
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

  function resetDefaults() {
    syncChanges(DEFAULT_TEMPLATES, DEFAULT_TAG_POOLS, normalizedCredentials);
  }

  // --- Reorder Kanban Modal Logic ---
  let reorderModalOpen = false;
  let reorderItems: CoverTemplateItem[] = [];

  function openReorderModal() {
    reorderItems = normalizedTemplates.map((t, i) => ({
      ...t,
      id: t.id || `tpl-${Date.now()}-${i}`,
    }));
    reorderModalOpen = true;
  }

  function closeReorderModal() {
    reorderModalOpen = false;
  }

  function handleReorderDnd(e: CustomEvent<DndEvent<CoverTemplateItem>>) {
    reorderItems = e.detail.items;
  }

  function handleReorderFinalize(e: CustomEvent<DndEvent<CoverTemplateItem>>) {
    reorderItems = e.detail.items;
    syncChanges(reorderItems, normalizedTagPools, normalizedCredentials);
  }

  const handleDndConsider = handleReorderDnd;
  const handleDndFinalize = handleReorderFinalize;

  function moveToTop(idx: number) {
    if (idx <= 0) return;
    const item = reorderItems.splice(idx, 1)[0];
    reorderItems.unshift(item);
    reorderItems = [...reorderItems];
    syncChanges(reorderItems, normalizedTagPools, normalizedCredentials);
  }

  function moveToBottom(idx: number) {
    if (idx >= reorderItems.length - 1) return;
    const item = reorderItems.splice(idx, 1)[0];
    reorderItems.push(item);
    reorderItems = [...reorderItems];
    syncChanges(reorderItems, normalizedTagPools, normalizedCredentials);
  }

  // --- JSON Import / Export Logic ---
  let jsonModalOpen = false;
  let jsonModalMode: "export" | "import" = "export";
  let jsonContent = "";
  let jsonCopied = false;
  let importMode: "append" | "overwrite" = "append";
  let importError = "";
  let fileInputRef: HTMLInputElement | null = null;

  function copyToClipboard(text: string) {
    if (navigator?.clipboard?.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function downloadJsonFile(content: string, filename = "more-background-templates.json") {
    const blob = new Blob([content], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function openExportModal() {
    jsonModalMode = "export";
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      templates: normalizedTemplates,
      tagPools: normalizedTagPools,
    };
    jsonContent = JSON.stringify(exportData, null, 2);
    jsonCopied = false;
    importError = "";
    jsonModalOpen = true;
  }

  function openImportModal() {
    jsonModalMode = "import";
    jsonContent = "";
    jsonCopied = false;
    importError = "";
    importMode = "append";
    jsonModalOpen = true;
  }

  function closeJsonModal() {
    jsonModalOpen = false;
    jsonContent = "";
    importError = "";
  }

  async function handleCopyJson() {
    await copyToClipboard(jsonContent);
    jsonCopied = true;
    setTimeout(() => {
      jsonCopied = false;
    }, 2000);
  }

  function handleDownloadJson() {
    downloadJsonFile(jsonContent, `damophus-more-background-templates-${Date.now()}.json`);
  }

  function handleFileSelect(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      jsonContent = (event.target?.result as string) || "";
      importError = "";
    };
    reader.onerror = () => {
      importError = "读取文件失败，请检查文件编码或格式。";
    };
    reader.readAsText(file);
  }

  function handleTriggerFileInput() {
    if (fileInputRef) {
      fileInputRef.value = "";
      fileInputRef.click();
    }
  }

  function handleConfirmImport() {
    importError = "";
    if (!jsonContent.trim()) {
      importError = "请输入或导入有效的 JSON 文本内容。";
      return;
    }
    try {
      const parsed = JSON.parse(jsonContent);
      const rawTemplates = Array.isArray(parsed) ? parsed : Array.isArray(parsed.templates) ? parsed.templates : null;
      const rawPools = Array.isArray(parsed.tagPools) ? parsed.tagPools : null;

      if (!rawTemplates && !rawPools) {
        importError = "未在 JSON 中找到可识别的 templates 或 tagPools 数组配置。";
        return;
      }

      const importedTemplates: CoverTemplateItem[] = rawTemplates || [];
      const importedPools: typeof normalizedTagPools = (rawPools || []).map((p: any) => ({
        ...p,
        items: (p.items || []).map(normalizeTagItem),
      }));

      const sanitizedTemplates: CoverTemplateItem[] = importedTemplates.map((tpl, i) => {
        const id = tpl.id || `tpl-imported-${Date.now()}-${i}`;
        const name = tpl.name || `导入模板 ${i + 1}`;
        const type = tpl.type || "booru";
        return {
          id,
          name,
          type,
          site: tpl.site,
          aspectRatio: tpl.aspectRatio,
          rating: tpl.rating,
          tags: tpl.tags,
          minScore: tpl.minScore,
          timeRange: tpl.timeRange,
          imageQuality: tpl.imageQuality,
          poolId: tpl.poolId,
          pool: tpl.pool,
          url: tpl.url,
          rules: tpl.rules,
        };
      });

      let nextTemplates: CoverTemplateItem[];
      if (importMode === "overwrite") {
        nextTemplates = sanitizedTemplates;
      } else {
        nextTemplates = [...normalizedTemplates, ...sanitizedTemplates];
      }

      let nextTagPools = normalizedTagPools;
      if (importedPools && importedPools.length > 0) {
        const sanitizedPools = importedPools.map((p) => ({
          ...p,
          items: (p.items || []).map(normalizeTagItem),
        }));
        if (importMode === "overwrite") {
          nextTagPools = sanitizedPools;
        } else {
          const existingIds = new Set(normalizedTagPools.map((p) => p.id));
          const newPools = sanitizedPools.filter((p) => !existingIds.has(p.id));
          nextTagPools = [...normalizedTagPools, ...newPools];
        }
      }

      syncChanges(nextTemplates, nextTagPools, normalizedCredentials);
      closeJsonModal();
    } catch (e: any) {
      importError = `JSON 解析错误: ${e.message || String(e)}`;
    }
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
    } else if (field === "imageQuality") {
      defaultVal = "sample";
    } else if (field === "timeRange") {
      defaultVal = "30d";
    } else if (field === "tags") {
      defaultVal = "wallpaper";
      defaultOp = "contains";
    } else if (field === "minScore") {
      defaultVal = 5;
      defaultOp = "gte";
    } else if (field === "excludeTagPool") {
      defaultVal = normalizedTagPools.find((p) => p.id === "pool-blacklist-default")?.id || normalizedTagPools[0]?.id || "";
      defaultOp = "excludeAllIn";
    } else if (field === "blacklist") {
      defaultVal = "grayscale, gay, two_males, bara, yaoi, guro, gore";
      defaultOp = "containsNone";
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
      if (r.field === "timeRange") patch.timeRange = r.value;
      if (r.field === "imageQuality") patch.imageQuality = r.value;
      if (r.field === "tagPool") patch.poolId = r.value;
      if (r.field === "blacklist") patch.blacklist = r.value;
    }
    updateTemplate(tplIndex, patch);
  }

  async function testTemplate(template: CoverTemplateItem) {
    testingTemplateId = template.id;
    templateTestResults[template.id] = undefined as any;
    templateImageLoadErrors[template.id] = false;
    templateImageLoadErrors = { ...templateImageLoadErrors };
    try {
      const url = templateToUrl(template, normalizedTagPools);
      const res = await resolveBooruImageInfo(url, normalizedCredentials);
      if (res && res.imageUrl) {
        // 与实际设置题头图机制保持 100% 一致：
        // 开启 writeToAssets 时测试代理下载到本地
        // 关闭 writeToAssets 时直接测试浏览器远程直链加载
        let displayUrl = res.imageUrl;
        if (writeToAssets) {
          displayUrl = await fetchImageForPreview(res.imageUrl);
        }
        templateTestResults[template.id] = {
          success: true,
          url: res.imageUrl,
          displayUrl: displayUrl || res.imageUrl,
          postUrl: res.postUrl,
          postId: res.postId,
          site: res.site,
          width: res.width,
          height: res.height,
          score: res.score,
          tags: res.tags,
        };
      } else {
        templateTestResults[template.id] = {
          success: false,
          error: t("lets-more-background.testFailed", "未找到符合条件的图片或网络超时"),
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
    } catch (err) {
      console.error("Failed to save MoreBackground basic setting:", err);
      saveStatus = "error";
    }
  }

  const RATIO_OPTIONS: { id: AspectRatioType; label: string; desc: string }[] = [
    { id: "landscape", label: "🖼️ 横屏 (>= 1.0)", desc: "推荐题头图比例" },
    { id: "wide", label: "📐 宽屏 (>= 1.33)", desc: "超宽横幅" },
    { id: "portrait", label: "📱 竖屏 (< 1.0)", desc: "竖向长图" },
    { id: "any", label: "🔄 任意比例", desc: "不限制比例" },
  ];

  const BOORU_SITES = [
    { id: "safebooru.org", label: "Safebooru.org (公开免密·免防盗链·首选推荐)" },
    { id: "yande.re", label: "Yande.re (超高清插画·免防盗链·强烈推荐)" },
    { id: "konachan.com", label: "Konachan (精品壁纸·免防盗链·强烈推荐)" },
    { id: "gelbooru.com", label: "Gelbooru (海量图库)" },
    { id: "safebooru.donmai.us", label: "Safebooru (Danbooru 镜像)" },
    { id: "danbooru.donmai.us", label: "Danbooru (官方主站·需存资源目录)" },
    { id: "e621.net", label: "E621" },
    { id: "tbib.org", label: "TBIB (The Big ImageBoard)" },
  ];

  const RULE_FIELDS: { id: FilterRule["field"]; label: string }[] = [
    { id: "aspectRatio", label: "画面比例 (Aspect Ratio)" },
    { id: "timeRange", label: "发布时间限制 (Time Range)" },
    { id: "minScore", label: "最低评分限制 (Min Score)" },
    { id: "imageQuality", label: "清晰度/预览图 (Quality / Preview)" },
    { id: "tagPool", label: "随机抽选词库池 (Tag Pool)" },
    { id: "excludeTagPool", label: "🚫 排除/屏蔽词库池 (Exclude Tag Pool)" },
    { id: "blacklist", label: "🚫 排除固定标签 (Exclude Tags / Blacklist)" },
    { id: "site", label: "目标站点 (Site)" },
    { id: "rating", label: "安全分级 (Rating)" },
    { id: "tags", label: "固定标签 (Fixed Tags)" },
  ];
</script>

<div class="more-background-settings flex flex-col gap-4 sm:gap-5 p-0.5 sm:p-1 relative" class:mobile>
  <!-- 顶部标题与保存状态栏 -->
  <header class="flex flex-wrap items-center justify-between gap-2.5 border-b border-border pb-3 sm:pb-4">
    <div class="space-y-1">
      <div class="flex items-center gap-2.5">
        <div class="flex size-7.5 sm:size-8 items-center justify-center rounded-lg bg-muted text-primary shrink-0 border border-border">
          <Image class="size-4" />
        </div>
        <div class="text-base font-semibold tracking-tight text-foreground" role="heading" aria-level="2">
          {title}
        </div>
        <Badge variant="secondary" class="text-[10px] sm:text-[11px] font-mono font-normal">v2.0 Plus</Badge>
      </div>
      <p class="text-xs text-muted-foreground leading-relaxed">
        {t("lets-more-background.description")}
      </p>
    </div>

    <!-- 实时保存状态指示器 (动画效果与时间戳) -->
    <div
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300 shadow-xs border shrink-0
      {saveStatus === 'saving' ? 'bg-primary/10 text-primary border-primary/30 animate-pulse' :
       saveStatus === 'saved' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' :
       saveStatus === 'error' ? 'bg-destructive/10 text-destructive border-destructive/30' :
       'bg-muted/50 text-muted-foreground border-border'}"
      title="配置实时自动保存状态"
    >
      {#if saveStatus === 'saving'}
        <Loader2 class="size-3.5 animate-spin text-primary shrink-0" />
        <span>正在保存...</span>
      {:else if saveStatus === 'saved'}
        <CheckCircle2 class="size-3.5 text-emerald-500 shrink-0 animate-in zoom-in-50 duration-200" />
        <span>
          已自动保存 {#if lastSavedTime}<span class="opacity-75 font-mono text-[10px] ml-0.5">({lastSavedTime})</span>{/if}
        </span>
      {:else if saveStatus === 'error'}
        <XCircle class="size-3.5 text-destructive shrink-0" />
        <span>保存失败</span>
      {:else}
        <Check class="size-3.5 text-muted-foreground shrink-0" />
        <span>自动保存就绪</span>
      {/if}
    </div>
  </header>

  <!-- 现代 Shadcn 选项卡导航 (响应式：移动端显示图标+精简提示，桌面端显示图标+文字) -->
  <Tabs.Root bind:value={activeTab} class="w-full space-y-3.5 sm:space-y-4">
    <Tabs.List class="damophus-tabs-list grid w-full grid-cols-4 max-w-3xl">
      <Tabs.Trigger
        value="templates"
        class="gap-1.5 py-1.5 sm:py-2 text-xs"
        title={t("lets-more-background.templatesTab", "条件模板与过滤器")}
        aria-label={t("lets-more-background.templatesTab", "条件模板与过滤器")}
      >
        <Layers class="size-4 shrink-0" />
        <span class="hidden sm:inline truncate">{t("lets-more-background.templatesTab", "条件模板与过滤器")}</span>
      </Tabs.Trigger>
      <Tabs.Trigger
        value="tagPools"
        class="gap-1.5 py-1.5 sm:py-2 text-xs"
        title={t("lets-more-background.tagPoolsTab", "Tag / 画师词库池")}
        aria-label={t("lets-more-background.tagPoolsTab", "Tag / 画师词库池")}
      >
        <Database class="size-4 shrink-0" />
        <span class="hidden sm:inline truncate">{t("lets-more-background.tagPoolsTab", "Tag / 画师词库池")}</span>
      </Tabs.Trigger>
      <Tabs.Trigger
        value="credentials"
        class="gap-1.5 py-1.5 sm:py-2 text-xs"
        title={t("lets-more-background.credentialsTab", "多站点 API 凭据")}
        aria-label={t("lets-more-background.credentialsTab", "多站点 API 凭据")}
      >
        <Key class="size-4 shrink-0" />
        <span class="hidden sm:inline truncate">{t("lets-more-background.credentialsTab", "多站点 API 凭据")}</span>
      </Tabs.Trigger>
      <Tabs.Trigger
        value="basic"
        class="gap-1.5 py-1.5 sm:py-2 text-xs"
        title={t("lets-more-background.basicTab", "基础与存储设置")}
        aria-label={t("lets-more-background.basicTab", "基础与存储设置")}
      >
        <SlidersHorizontal class="size-4 shrink-0" />
        <span class="hidden sm:inline truncate">{t("lets-more-background.basicTab", "基础与存储设置")}</span>
      </Tabs.Trigger>
    </Tabs.List>

    <!-- Tab 1: 条件模板与 Query Builder 过滤器 -->
    <Tabs.Content value="templates" class="space-y-3.5 sm:space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 rounded-lg border border-border bg-card p-3">
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <Layers class="size-3.5 text-primary shrink-0" />
          <span>已配置 <strong class="font-semibold text-foreground">{normalizedTemplates.length}</strong> 个条件模板</span>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 sm:gap-2 self-end sm:self-auto">
          <Button variant="outline" size="sm" onclick={openReorderModal} class="h-7 text-xs gap-1.5 font-medium border-primary/40 text-primary hover:bg-primary/10" title="通过看板拖拽自由调整模板优先级顺序">
            <GripVertical class="size-3.5" />
            <span>看板排序</span>
          </Button>
          <Button variant="outline" size="sm" onclick={openImportModal} class="h-7 text-xs gap-1.5" title="导入 JSON 预设文件或配置文本">
            <Upload class="size-3.5" />
            <span>导入 JSON</span>
          </Button>
          <Button variant="outline" size="sm" onclick={openExportModal} class="h-7 text-xs gap-1.5" title="导出全部模板为 JSON 格式">
            <Download class="size-3.5" />
            <span>导出 JSON</span>
          </Button>
          <Button variant="outline" size="sm" onclick={resetDefaults} class="h-7 text-xs gap-1.5" title="重置为默认官方预设">
            <RefreshCw class="size-3.5" />
            <span class="hidden xs:inline">恢复预设</span>
          </Button>
          <Button variant="secondary" size="sm" onclick={addTemplate} class="h-7 text-xs gap-1.5 font-medium">
            <Plus class="size-3.5" />
            <span>{t("lets-more-background.addTemplate", "添加模板")}</span>
          </Button>
        </div>
      </div>

      <div class="space-y-3.5">
        {#each normalizedTemplates as template, tplIndex (template.id || tplIndex)}
          <div class="damophus-card p-3.5 sm:p-4 space-y-3.5">
            <!-- 模板卡片顶部栏 -->
            <div class="flex items-center justify-between gap-2 border-b border-border pb-3">
              <div class="flex flex-1 items-center gap-2 min-w-0">
                <Sparkles class="size-4 text-primary shrink-0" />
                <Input
                  value={template.name || ""}
                  oninput={(e) => updateTemplate(tplIndex, { name: (e.target as HTMLInputElement).value })}
                  placeholder={t("lets-more-background.templateName", "模板名称")}
                  class="font-medium text-sm h-8 bg-background flex-1 min-w-0"
                />
              </div>

              <!-- 操作按钮 (删除) -->
              <div class="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onclick={() => removeTemplate(tplIndex)}
                  title="删除模板"
                >
                  <Trash2 class="size-3.5" />
                </Button>
              </div>
            </div>

            <!-- 图源类型选择 (完全受控的 Segmented Control，适配移动端弹性排版) -->
            <div class="space-y-2.5 sm:space-y-3">
              <div class="flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
                <span class="font-medium text-muted-foreground shrink-0">图源类型:</span>
                <div class="damophus-segmented w-full sm:w-auto" role="radiogroup" aria-label="图源类型">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={template.type === "booru"}
                    class="damophus-segmented__item flex-1 sm:flex-initial justify-center"
                    class:damophus-segmented__item--active={template.type === "booru"}
                    onclick={() => updateTemplate(tplIndex, { type: "booru" })}
                  >
                    <Palette class="size-3.5 text-primary" />
                    <span>Booru 规则</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={template.type === "preset_api"}
                    class="damophus-segmented__item flex-1 sm:flex-initial justify-center"
                    class:damophus-segmented__item--active={template.type === "preset_api"}
                    onclick={() => updateTemplate(tplIndex, { type: "preset_api" })}
                  >
                    <Globe class="size-3.5 text-primary" />
                    <span>在线 API</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={template.type === "custom_url"}
                    class="damophus-segmented__item flex-1 sm:flex-initial justify-center"
                    class:damophus-segmented__item--active={template.type === "custom_url"}
                    onclick={() => updateTemplate(tplIndex, { type: "custom_url" })}
                  >
                    <Link2 class="size-3.5 text-primary" />
                    <span>直接 URL</span>
                  </button>
                </div>
              </div>

              {#if template.type === "booru"}
                <!-- Query Builder 规则构建区域 -->
                <div class="rounded-lg border border-border bg-muted/30 p-3 sm:p-3.5 space-y-3">
                  <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                    <div class="font-medium text-xs text-foreground flex items-center gap-1.5 sm:gap-2">
                      <Sliders class="size-3.5 text-primary" />
                      <span>过滤规则 (Query Builder)</span>
                      <Badge variant="secondary" class="text-[10px] font-mono">{template.rules?.length || 0}</Badge>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <select
                        class="damophus-select text-primary font-medium text-xs max-w-[160px] sm:max-w-none"
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

                  <!-- 规则行列表 (移动端两行响应式卡片化排列，桌面端单行对齐) -->
                  <div class="space-y-2">
                    {#if !template.rules || template.rules.length === 0}
                      <div class="text-xs text-muted-foreground p-3 text-center bg-background/50 rounded border border-dashed border-border">
                        暂无过滤规则，点击右上角「+ 添加条件规则」定制图源。
                      </div>
                    {:else}
                      {#each template.rules as rule, rIndex (rule.id || rIndex)}
                        <div class="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md bg-background p-2.5 border border-border text-xs">
                          <!-- 移动端顶部行 / 桌面端左侧：字段名 + 操作符 + 移动端删除按钮 -->
                          <div class="flex items-center justify-between sm:justify-start gap-2 min-w-0">
                            <div class="w-auto sm:w-44 font-medium text-foreground truncate shrink-0 flex items-center gap-1.5 px-0.5">
                              <span class="truncate">{RULE_FIELDS.find((f) => f.id === rule.field)?.label || rule.field}</span>
                            </div>

                            <span class="text-muted-foreground font-mono text-[11px] px-2 py-0.5 rounded bg-muted border border-border shrink-0">
                              {rule.operator === "randomIn"
                                ? "random in"
                                : rule.operator === "excludeAllIn"
                                ? "exclude all in"
                                : rule.operator === "containsNone"
                                ? "exclude tags"
                                : rule.operator === "contains"
                                ? "contains"
                                : rule.operator === "gte"
                                ? ">="
                                : "="}
                            </span>

                            <!-- 移动端专属删除按钮 (桌面端隐藏) -->
                            <div class="sm:hidden ml-auto">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                class="size-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onclick={() => removeRuleFromTemplate(tplIndex, rIndex)}
                                title="删除此规则"
                              >
                                <Trash2 class="size-3" />
                              </Button>
                            </div>
                          </div>

                          <!-- 目标值编辑 -->
                          <div class="flex-1 w-full sm:w-auto min-w-0">
                            {#if rule.field === "aspectRatio"}
                              <select
                                value={rule.value || "landscape"}
                                onchange={(e) => updateRuleInTemplate(tplIndex, rIndex, { value: (e.target as any).value })}
                                class="damophus-select w-full"
                              >
                                {#each RATIO_OPTIONS as opt}
                                  <option value={opt.id}>{opt.label} - {opt.desc}</option>
                                {/each}
                              </select>
                            {:else if rule.field === "tagPool"}
                              <select
                                value={rule.value || normalizedTagPools[0]?.id}
                                onchange={(e) => updateRuleInTemplate(tplIndex, rIndex, { value: (e.target as any).value })}
                                class="damophus-select w-full text-primary font-medium"
                              >
                                {#each normalizedTagPools as pool}
                                  <option value={pool.id}>
                                    {pool.name} (共 {pool.items?.length || 0} 条)
                                  </option>
                                {/each}
                              </select>
                            {:else if rule.field === "excludeTagPool"}
                              <select
                                value={rule.value || (normalizedTagPools.find(p => p.id === "pool-blacklist-default")?.id || normalizedTagPools[0]?.id)}
                                onchange={(e) => updateRuleInTemplate(tplIndex, rIndex, { value: (e.target as any).value })}
                                class="damophus-select w-full text-destructive font-medium border-destructive/30"
                              >
                                {#each normalizedTagPools as pool}
                                  <option value={pool.id}>
                                    {pool.name} (共 {pool.items?.length || 0} 条排除项)
                                  </option>
                                {/each}
                              </select>
                            {:else if rule.field === "blacklist"}
                              <Input
                                value={rule.value || ""}
                                oninput={(e) => updateRuleInTemplate(tplIndex, rIndex, { value: (e.target as HTMLInputElement).value })}
                                placeholder="例如: grayscale, gay, two_males, bara, yaoi, guro"
                                class="h-7 text-xs font-mono bg-background w-full border-destructive/30"
                              />
                            {:else if rule.field === "site"}
                              <select
                                value={rule.value || "safebooru.org"}
                                onchange={(e) => updateRuleInTemplate(tplIndex, rIndex, { value: (e.target as any).value })}
                                class="damophus-select w-full font-medium"
                              >
                                {#each BOORU_SITES as s}
                                  <option value={s.id}>{s.label}</option>
                                {/each}
                              </select>
                            {:else if rule.field === "rating"}
                              <select
                                value={rule.value || "safe"}
                                onchange={(e) => updateRuleInTemplate(tplIndex, rIndex, { value: (e.target as any).value })}
                                class="damophus-select w-full font-medium"
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
                                placeholder="例如 5 (分及以上)"
                                class="h-7 text-xs font-mono bg-background w-full"
                              />
                            {:else if rule.field === "timeRange"}
                              {@const isPreset = ["any", "7d", "30d", "90d", "180d", "365d", "730d"].includes(rule.value || "any")}
                              <div class="space-y-1.5 w-full">
                                <select
                                  value={isPreset ? (rule.value || "any") : "custom"}
                                  onchange={(e) => {
                                    const val = (e.target as any).value;
                                    if (val !== "custom") {
                                      updateRuleInTemplate(tplIndex, rIndex, { value: val });
                                    } else if (isPreset) {
                                      updateRuleInTemplate(tplIndex, rIndex, { value: "2023+" });
                                    }
                                  }}
                                  class="damophus-select w-full font-medium"
                                >
                                  <option value="any">不限时间 (All Time - 全部收录)</option>
                                  <option value="7d">最近 7 天内 (7d)</option>
                                  <option value="30d">最近 30 天内 (30d / 1 个月)</option>
                                  <option value="90d">最近 3 个月内 (90d)</option>
                                  <option value="180d">最近半年内 (180d / 半年)</option>
                                  <option value="365d">最近 1 年内 (365d / 1 年)</option>
                                  <option value="730d">最近 2 年内 (730d / 2 年)</option>
                                  <option value="custom">✏️ 自定义时间 (Custom / 年份 / 日期区间)...</option>
                                </select>

                                {#if !isPreset}
                                  <Input
                                    value={rule.value || ""}
                                    oninput={(e) => updateRuleInTemplate(tplIndex, rIndex, { value: (e.target as HTMLInputElement).value })}
                                    placeholder="例如: 2023+ | 2020..2024 | 60d | >= 2024-01-01"
                                    class="h-7 text-xs font-mono bg-background w-full"
                                  />
                                  <div class="text-[10px] text-muted-foreground/85 leading-relaxed flex flex-wrap items-center gap-1.5 pt-0.5">
                                    <span>💡 示例:</span>
                                    <button
                                      type="button"
                                      class="font-mono bg-muted hover:bg-primary/10 hover:text-primary px-1.5 py-0.5 rounded transition-colors"
                                      onclick={() => updateRuleInTemplate(tplIndex, rIndex, { value: "2023+" })}
                                    >
                                      2023+
                                    </button>
                                    <button
                                      type="button"
                                      class="font-mono bg-muted hover:bg-primary/10 hover:text-primary px-1.5 py-0.5 rounded transition-colors"
                                      onclick={() => updateRuleInTemplate(tplIndex, rIndex, { value: "2020..2024" })}
                                    >
                                      2020..2024
                                    </button>
                                    <button
                                      type="button"
                                      class="font-mono bg-muted hover:bg-primary/10 hover:text-primary px-1.5 py-0.5 rounded transition-colors"
                                      onclick={() => updateRuleInTemplate(tplIndex, rIndex, { value: "60d" })}
                                    >
                                      60d
                                    </button>
                                    <button
                                      type="button"
                                      class="font-mono bg-muted hover:bg-primary/10 hover:text-primary px-1.5 py-0.5 rounded transition-colors"
                                      onclick={() => updateRuleInTemplate(tplIndex, rIndex, { value: ">= 2024-01-01" })}
                                    >
                                      &gt;= 2024-01-01
                                    </button>
                                  </div>
                                {/if}
                              </div>
                            {:else if rule.field === "imageQuality"}
                              <select
                                value={rule.value || "sample"}
                                onchange={(e) => updateRuleInTemplate(tplIndex, rIndex, { value: (e.target as any).value })}
                                class="damophus-select w-full font-medium"
                              >
                                <option value="original">原图高清 (Original - 默认最高画质)</option>
                                <option value="sample">中等大图 (Sample - 850~1500px 防防盗链/加速)</option>
                                <option value="preview">缩略预览 (Preview - 快速预览图/免防盗链)</option>
                              </select>
                            {:else}
                              <Input
                                value={rule.value || ""}
                                oninput={(e) => updateRuleInTemplate(tplIndex, rIndex, { value: (e.target as HTMLInputElement).value })}
                                placeholder="wallpaper scenery"
                                class="h-7 text-xs font-mono bg-background w-full"
                              />
                            {/if}
                          </div>

                          <!-- 桌面端删除规则按钮 (移动端已显示在行头) -->
                          <div class="hidden sm:block shrink-0">
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
                        </div>
                      {/each}
                    {/if}
                  </div>
                </div>
              {:else}
                <div class="rounded-lg border border-border bg-muted/30 p-3 sm:p-3.5 space-y-2">
                  <Label class="text-xs font-medium text-foreground block">图片 URL / API 接口地址</Label>
                  <Input
                    value={template.url || ""}
                    oninput={(e) => updateTemplate(tplIndex, { url: (e.target as HTMLInputElement).value })}
                    placeholder="https://..."
                    class="h-8 text-xs font-mono bg-background"
                  />
                  <p class="text-[11px] text-muted-foreground">
                    支持 <code>&#123;width&#125;</code> 与 <code>&#123;height&#125;</code> 尺寸占位符替换。
                  </p>
                </div>
              {/if}

              <!-- 卡片底部：测试出图与实时预览 -->
              <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 border border-border p-2.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={testingTemplateId === template.id}
                  onclick={() => testTemplate(template)}
                  class="h-7 text-xs gap-1.5 font-medium"
                >
                  {#if testingTemplateId === template.id}
                    <Loader2 class="size-3.5 animate-spin" />
                    <span>{t("lets-more-background.testing", "测试中...")}</span>
                  {:else}
                    <Eye class="size-3.5" />
                    <span>{t("lets-more-background.testTemplateBtn", "测试出图并预览")}</span>
                  {/if}
                </Button>

                {#if templateTestResults[template.id]}
                  {#if templateTestResults[template.id].success}
                    <Badge variant="secondary" class="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 gap-1.5 py-1 px-2.5 text-xs font-medium">
                      <CheckCircle2 class="size-3.5" />
                      <span>{t("lets-more-background.testSuccess", "测试成功！")}</span>
                    </Badge>
                  {:else}
                    <Badge variant="destructive" class="gap-1.5 py-1 px-2.5 text-xs font-medium">
                      <XCircle class="size-3.5" />
                      <span class="truncate max-w-[200px] sm:max-w-[280px]">{templateTestResults[template.id].error}</span>
                    </Badge>
                  {/if}
                {/if}
              </div>

              <!-- 测试成功后的预览图与原帖跳转 -->
              {#if templateTestResults[template.id]?.url}
                <div class="rounded-lg border border-border overflow-hidden bg-card p-3 space-y-2.5">
                  <div class="text-[11px] text-muted-foreground flex flex-wrap items-center justify-between gap-2 font-medium">
                    <span class="flex items-center gap-1.5">
                      <Image class="size-3.5 text-primary" />
                      <span>{t("lets-more-background.previewImage", "获取到的图片预览")}</span>
                      {#if templateTestResults[template.id].width && templateTestResults[template.id].height}
                        <span class="text-[10px] text-muted-foreground/80 font-mono">
                          ({templateTestResults[template.id].width} × {templateTestResults[template.id].height})
                        </span>
                      {/if}
                    </span>

                    <div class="flex flex-wrap items-center gap-2">
                      {#if templateTestResults[template.id].tags && (Array.isArray(templateTestResults[template.id].tags) ? templateTestResults[template.id].tags.length > 0 : String(templateTestResults[template.id].tags).trim().length > 0)}
                        <Button
                          variant="outline"
                          size="sm"
                          class="h-6 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/10 px-2 py-0"
                          onclick={() => {
                            const r = templateTestResults[template.id];
                            openCoverTagViewer({
                              site: r.site,
                              postId: r.postId,
                              postUrl: r.postUrl,
                              tags: r.tags,
                              score: r.score,
                              width: r.width,
                              height: r.height,
                            });
                          }}
                        >
                          <Tag class="size-3" />
                          <span>查看 Tag 标签 ({Array.isArray(templateTestResults[template.id].tags) ? templateTestResults[template.id].tags.length : String(templateTestResults[template.id].tags || "").split(/\s+/).filter(Boolean).length})</span>
                        </Button>
                      {/if}

                      {#if templateTestResults[template.id].postUrl}
                        <a
                          href={templateTestResults[template.id].postUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-primary hover:bg-primary/20 transition-colors text-xs font-medium"
                          title="跳转至网站原贴查看全量标签、画师与原作详情"
                        >
                          <ExternalLink class="size-3" />
                          <span>打开原帖页面{#if templateTestResults[template.id].postId} (#{templateTestResults[template.id].postId}){/if}</span>
                          <span class="text-[10px]">↗</span>
                        </a>
                      {/if}
                      <a
                        href={templateTestResults[template.id].url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs transition-colors"
                      >
                        <span>原图直链</span>
                        <span>↗</span>
                      </a>
                    </div>
                  </div>
                  <div class="overflow-hidden rounded border border-border bg-background max-h-72 flex flex-col items-center justify-center relative">
                    {#if templateImageLoadErrors[template.id]}
                      <div class="p-4 text-center space-y-1.5 bg-destructive/10 text-destructive text-xs w-full">
                        <p class="font-semibold flex items-center justify-center gap-1.5">
                          <XCircle class="size-4" />
                          <span>浏览器直链加载失败 (403 Forbidden / 防盗链拦截)</span>
                        </p>
                        <p class="text-[11px] text-muted-foreground leading-relaxed max-w-lg mx-auto">
                          该站点官方 CDN（如 Danbooru）限制了浏览器跨域直链嵌入。若想使用该站点，请在下方勾选开启<b>「保存题头图到资源目录」</b>；或者将模板站点改为支持免防盗链直链的图源（如 <b>Safebooru.org</b>、<b>Yande.re</b>、<b>Konachan</b> 等）。
                        </p>
                      </div>
                    {:else}
                      <img
                        src={templateTestResults[template.id].displayUrl || templateTestResults[template.id].url}
                        alt="Cover Preview"
                        referrerpolicy="no-referrer"
                        onerror={() => {
                          templateImageLoadErrors[template.id] = true;
                          templateImageLoadErrors = { ...templateImageLoadErrors };
                        }}
                        class="max-h-72 w-full object-cover rounded transition-transform hover:scale-[1.01] duration-200"
                      />
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </Tabs.Content>

    <!-- Tab 2: 独立 Tag / 画师词库池管理 -->
    <Tabs.Content value="tagPools" class="space-y-3.5 sm:space-y-4">
      <!-- 头部说明横幅 -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 sm:p-3.5">
        <div class="flex items-center gap-2.5 sm:gap-3">
          <div class="flex size-7.5 sm:size-8 items-center justify-center rounded-lg bg-muted text-primary shrink-0 border border-border">
            <Database class="size-4" />
          </div>
          <div class="space-y-0.5">
            <div class="font-semibold text-sm text-foreground flex items-center gap-2">
              <span>{t("lets-more-background.tagPoolsTitle", "画师与 Tag 词库池独立管理")}</span>
              <Badge variant="secondary" class="text-[10px] font-mono">{normalizedTagPools.length}</Badge>
            </div>
            <p class="text-xs text-muted-foreground leading-relaxed max-w-2xl">
              {t("lets-more-background.tagPoolsDesc", "集中维护您的画师清单或主题词库，更新后所有模板自动生效。")}
            </p>
          </div>
        </div>

        <Button variant="secondary" size="sm" onclick={addTagPool} class="h-7.5 sm:h-8 text-xs gap-1.5 font-medium shrink-0 self-end sm:self-auto">
          <Plus class="size-3.5" />
          {t("lets-more-background.addTagPool", "创建词库池")}
        </Button>
      </div>

      <!-- 词库卡片列表 -->
      <div class="space-y-3.5">
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

          <div class="damophus-card p-3.5 sm:p-4 space-y-3">
            <!-- 词库卡片头部 -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 border-b border-border pb-2.5">
              <div class="flex-1 min-w-0 flex items-center gap-2">
                <Palette class="size-4 text-primary shrink-0" />
                <div class="min-w-0">
                  <div class="font-semibold text-sm text-foreground truncate">
                    {pool.name}
                  </div>
                  {#if pool.description}
                    <p class="text-xs text-muted-foreground mt-0.5 truncate">{pool.description}</p>
                  {/if}
                </div>
              </div>

              <div class="flex items-center gap-1.5 sm:gap-2 self-end sm:self-auto shrink-0">
                <Badge variant="secondary" class="text-[10px] sm:text-[11px] font-mono font-medium px-2 py-0.5">
                  共 {pool.items?.length || 0} 条
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-7 text-xs gap-1.5 font-medium"
                  onclick={() => openPoolEditor(poolIndex)}
                >
                  <Edit3 class="size-3.5 text-primary" />
                  <span>编辑 / 导入</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onclick={() => removeTagPool(poolIndex)}
                  title="删除词库"
                >
                  <Trash2 class="size-3.5" />
                </Button>
              </div>
            </div>

            <!-- 搜索过滤与快速添加栏 (移动端两行自适应，桌面端单行左右分布) -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <!-- 快捷搜索 -->
              <div class="relative w-full sm:w-52">
                <Search class="size-3.5 absolute left-2.5 top-2 text-muted-foreground" />
                <Input
                  bind:value={tagSearchQueryMap[poolIndex]}
                  placeholder="过滤当前词库..."
                  class="h-7 text-xs pl-8 bg-background w-full"
                />
              </div>

              <!-- 快捷单条添加 -->
              <div class="flex items-center gap-1.5 w-full sm:max-w-md justify-end">
                <Input
                  bind:value={quickAddInputMap[poolIndex]}
                  onkeydown={(e) => { if (e.key === "Enter") quickAddTag(poolIndex); }}
                  placeholder="输入新画师/Tag (如 ask_(askzy) # Ask)..."
                  class="h-7 text-xs bg-background flex-1 min-w-0"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  class="h-7 text-xs shrink-0 gap-1 font-medium"
                  onclick={() => quickAddTag(poolIndex)}
                >
                  <Plus class="size-3" />
                  添加
                </Button>
              </div>
            </div>

            <!-- 优雅精致的 Tag 胶囊网格 -->
            <div class="min-h-16 max-h-64 overflow-y-auto rounded-md bg-muted/25 p-2.5 sm:p-3 border border-border">
              {#if filteredItems.length === 0}
                <div class="text-xs text-muted-foreground text-center py-5">
                  {pool.items?.length === 0
                    ? "词库暂无词条，点击右上角「编辑 / 导入」一键粘贴"
                    : "未找到与搜索词匹配的词条"}
                </div>
              {:else}
                <div class="flex flex-wrap gap-1.5 sm:gap-2">
                  {#each filteredItems as item, itemIdx (itemIdx)}
                    {@const entry = normalizeTagItem(item)}
                    <div class="damophus-chip">
                      <span class="damophus-chip__tag">{entry.tag}</span>
                      {#if entry.zh}
                        <span class="damophus-chip__zh">
                          {entry.zh}
                        </span>
                      {/if}
                      <button
                        type="button"
                        class="damophus-chip-delete"
                        onclick={() => removeTagFromPool(poolIndex, itemIdx)}
                        title="删除此Tag"
                        aria-label="删除此Tag"
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
    <Tabs.Content value="credentials" class="space-y-3.5 sm:space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 sm:p-3.5">
        <div class="flex items-center gap-2.5 sm:gap-3">
          <div class="flex size-7.5 sm:size-8 items-center justify-center rounded-lg bg-muted text-primary shrink-0 border border-border">
            <Key class="size-4" />
          </div>
          <div class="space-y-0.5">
            <div class="font-semibold text-sm text-foreground">
              {t("lets-more-background.credentialsTitle", "多站点 API 凭据管理")}
            </div>
            <p class="text-xs text-muted-foreground leading-relaxed max-w-2xl">
              {t("lets-more-background.credentialsDescription", "分别配置各个 Booru 站点的登录账号与 API Key，用于解除并发和多标签搜索限制。Safebooru 等公开免密站点可直接使用。")}
            </p>
          </div>
        </div>

        <Button variant="secondary" size="sm" onclick={addCredential} class="h-7.5 sm:h-8 text-xs gap-1.5 font-medium shrink-0 self-end sm:self-auto">
          <Plus class="size-3.5" />
          {t("lets-more-background.addCredential", "添加站点凭据")}
        </Button>
      </div>

      <div class="space-y-3.5">
        {#each normalizedCredentials as cred, index (cred.id || index)}
          <div class="damophus-card p-3.5 sm:p-4 text-xs space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-3.5">
              <div>
                <Label class="text-xs text-muted-foreground font-medium mb-1.5 block">站点域名 (Site Domain)</Label>
                <Input
                  value={cred.site || ""}
                  oninput={(e) => updateCredential(index, { site: (e.target as HTMLInputElement).value })}
                  placeholder="danbooru.donmai.us"
                  class="h-8 text-xs bg-background w-full"
                />
              </div>

              <div>
                <Label class="text-xs text-muted-foreground font-medium mb-1.5 block">用户名 / Login ID</Label>
                <Input
                  value={cred.login || ""}
                  oninput={(e) => updateCredential(index, { login: (e.target as HTMLInputElement).value })}
                  placeholder="您的登录名 / User ID"
                  class="h-8 text-xs bg-background w-full"
                />
              </div>

              <div>
                <Label class="text-xs text-muted-foreground font-medium mb-1.5 block">API Key 密钥</Label>
                <Input
                  type="password"
                  value={cred.apiKey || ""}
                  oninput={(e) => updateCredential(index, { apiKey: (e.target as HTMLInputElement).value })}
                  placeholder="API Key / Token"
                  class="h-8 text-xs font-mono bg-background w-full"
                />
              </div>
            </div>

            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-t border-border pt-3">
              <div class="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={testingCredId === cred.id}
                  onclick={() => testCredentialItem(cred)}
                  class="h-7 text-xs gap-1.5 font-medium"
                >
                  {#if testingCredId === cred.id}
                    <Loader2 class="size-3.5 animate-spin" />
                    <span>测试中...</span>
                  {:else}
                    <Key class="size-3.5 text-primary" />
                    <span>测试连接</span>
                  {/if}
                </Button>

                {#if credTestResults[cred.id]}
                  <Badge
                    variant={credTestResults[cred.id].success ? "secondary" : "destructive"}
                    class="text-xs gap-1.5 py-1 px-2.5 {credTestResults[cred.id].success ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : ''}"
                  >
                    {#if credTestResults[cred.id].success}
                      <CheckCircle2 class="size-3.5" />
                    {:else}
                      <XCircle class="size-3.5" />
                    {/if}
                    <span class="truncate max-w-[180px] sm:max-w-none">{credTestResults[cred.id].message}</span>
                  </Badge>
                {/if}
              </div>

              <Button
                variant="ghost"
                size="sm"
                class="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-7 text-xs self-end sm:self-auto"
                onclick={() => removeCredential(index)}
              >
                <Trash2 class="size-3.5 mr-1" />
                删除凭据
              </Button>
            </div>
          </div>
        {/each}
      </div>
    </Tabs.Content>

    <!-- Tab 4: 基础设置 -->
    <Tabs.Content value="basic" class="space-y-3.5 sm:space-y-4">
      <div class="damophus-card p-4 sm:p-5 space-y-3.5 sm:space-y-4 text-xs">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
          <div>
            <Label class="text-xs font-medium mb-1.5 block">{t("lets-more-background.widthTitle", "图片宽度")}</Label>
            <Input
              type="number"
              value={width}
              oninput={(e) => handleBasicChange("width", parseInt((e.target as HTMLInputElement).value, 10) || 1920)}
              class="h-8 text-xs font-mono bg-background"
            />
            <p class="text-[11px] text-muted-foreground mt-1">{t("lets-more-background.widthDescription")}</p>
          </div>

          <div>
            <Label class="text-xs font-medium mb-1.5 block">{t("lets-more-background.heightTitle", "图片高度")}</Label>
            <Input
              type="number"
              value={height}
              oninput={(e) => handleBasicChange("height", parseInt((e.target as HTMLInputElement).value, 10) || 1080)}
              class="h-8 text-xs font-mono bg-background"
            />
            <p class="text-[11px] text-muted-foreground mt-1">{t("lets-more-background.heightDescription")}</p>
          </div>
        </div>

        <div class="border-t border-border pt-3.5 sm:pt-4">
          <Label class="text-xs font-medium mb-1.5 block">{t("lets-more-background.assetsLocationTitle", "题头图资源目录")}</Label>
          <Input
            value={assetsLocation}
            oninput={(e) => handleBasicChange("assetsLocation", (e.target as HTMLInputElement).value)}
            class="h-8 text-xs font-mono bg-background"
          />
          <p class="text-[11px] text-muted-foreground mt-1">{t("lets-more-background.assetsLocationDescription")}</p>
        </div>

        <div class="border-t border-border pt-3.5 sm:pt-4 flex items-center justify-between gap-3 sm:gap-4">
          <div class="space-y-0.5">
            <div class="font-medium text-foreground">{t("lets-more-background.readFromAssetsTitle", "从资源目录随机读取")}</div>
            <p class="text-[11px] text-muted-foreground">{t("lets-more-background.readFromAssetsDescription")}</p>
          </div>
          <Switch
            checked={readFromAssets}
            onCheckedChange={(val) => handleBasicChange("readFromAssets", val)}
          />
        </div>

        <div class="border-t border-border pt-3.5 sm:pt-4 flex items-center justify-between gap-3 sm:gap-4">
          <div class="space-y-0.5">
            <div class="font-medium text-foreground">{t("lets-more-background.localCacheTitle")}</div>
            <p class="text-[11px] text-muted-foreground">{t("lets-more-background.localCacheDescription")}</p>
          </div>
          <Switch checked={localCache} onCheckedChange={(val) => handleBasicChange("localCache", val)} />
        </div>

        {#if localCache}
          <div class="border-t border-border pt-3.5 sm:pt-4 space-y-1.5">
            <Label class="text-xs font-medium mb-1.5 block">{t("lets-more-background.localCacheRootTitle")}</Label>
            <Input
              value={localCacheRoot}
              oninput={(e) => handleBasicChange("localCacheRoot", (e.target as HTMLInputElement).value)}
              class="h-8 text-xs font-mono bg-background"
            />
            <p class="text-[11px] text-muted-foreground">{t("lets-more-background.localCacheRootDescription")}</p>
          </div>

          <div class="border-t border-border pt-3.5 sm:pt-4 space-y-1.5">
            <Label class="text-xs font-medium mb-1.5 block">{t("lets-more-background.localCachePathTemplateTitle")}</Label>
            <Input
              value={localCachePathTemplate}
              oninput={(e) => handleBasicChange("localCachePathTemplate", (e.target as HTMLInputElement).value)}
              class="h-8 text-xs font-mono bg-background"
            />
            <p class="text-[11px] text-muted-foreground">{t("lets-more-background.localCachePathTemplateDescription")}</p>
          </div>

          <div class="border-t border-border pt-3.5 sm:pt-4 space-y-1.5">
            <Label class="text-xs font-medium mb-1.5 block">{t("lets-more-background.localCacheMaxEdgeTitle")}</Label>
            <select
              class="h-8 w-full rounded border border-input bg-background px-2 text-xs text-foreground"
              value={localCacheMaxEdge}
              onchange={(event) => {
                localCacheMaxEdge = (event.currentTarget as HTMLSelectElement).value as typeof localCacheMaxEdge;
                void handleBasicChange("localCacheMaxEdge", localCacheMaxEdge);
              }}
            >
              <option value="none">{t("lets-more-background.localCacheMaxEdgeOriginal")}</option>
              <option value="1280">{t("lets-more-background.localCacheMaxEdge1280")}</option>
              <option value="1920">{t("lets-more-background.localCacheMaxEdge1920")}</option>
              <option value="2560">{t("lets-more-background.localCacheMaxEdge2560")}</option>
            </select>
            <p class="text-[11px] text-muted-foreground">{t("lets-more-background.localCacheMaxEdgeDescription")}</p>
          </div>
        {/if}

        <div class="border-t border-border pt-3.5 sm:pt-4 flex items-center justify-between gap-3 sm:gap-4">
          <div class="space-y-0.5">
            <div class="font-medium text-foreground">{t("lets-more-background.writeToAssetsTitle", "保存题头图到资源目录")}</div>
            <p class="text-[11px] text-muted-foreground">{t("lets-more-background.writeToAssetsDescription")}</p>
          </div>
          <Switch
            checked={writeToAssets}
            onCheckedChange={(val) => handleBasicChange("writeToAssets", val)}
          />
        </div>

        <div class="border-t border-border pt-3.5 sm:pt-4 flex items-center justify-between gap-3 sm:gap-4">
          <div class="space-y-0.5">
            <div class="font-medium text-foreground">{t("lets-more-background.directDragTitle", "题头图直接拖拽调整")}</div>
            <p class="text-[11px] text-muted-foreground">{t("lets-more-background.directDragDescription")}</p>
          </div>
          <Switch
            checked={directDrag}
            onCheckedChange={(val) => handleBasicChange("directDrag", val)}
          />
        </div>

        <div class="border-t border-border pt-3.5 sm:pt-4 space-y-3">
          <div>
            <Label class="text-xs font-medium mb-1.5 block">{t("lets-more-background.toolbarPositionTitle")}</Label>
            <select
              class="h-8 w-full rounded border border-input bg-background px-2 text-xs text-foreground"
              value={toolbarPosition}
              onchange={(event) => {
                toolbarPosition = (event.currentTarget as HTMLSelectElement).value as typeof toolbarPosition;
                void handleBasicChange("toolbarPosition", toolbarPosition);
              }}
            >
              <option value="belowIcon">{t("lets-more-background.toolbarPositionBelowIcon")}</option>
              <option value="native">{t("lets-more-background.toolbarPositionNative")}</option>
              <option value="custom">{t("lets-more-background.toolbarPositionCustom")}</option>
            </select>
            <p class="text-[11px] text-muted-foreground mt-1">{t("lets-more-background.toolbarPositionDescription")}</p>
          </div>

          {#if toolbarPosition === "custom"}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
              <label class="space-y-1.5">
                <span class="flex justify-between gap-2"><span>{t("lets-more-background.toolbarCustomXTitle")}</span><span>{toolbarCustomX}%</span></span>
                <input class="w-full accent-primary" type="range" min="0" max="100" step="1" value={toolbarCustomX} oninput={(event) => {
                  toolbarCustomX = Number((event.currentTarget as HTMLInputElement).value);
                  void handleBasicChange("toolbarCustomX", toolbarCustomX);
                }} />
              </label>
              <label class="space-y-1.5">
                <span class="flex justify-between gap-2"><span>{t("lets-more-background.toolbarCustomYTitle")}</span><span>{toolbarCustomY}%</span></span>
                <input class="w-full accent-primary" type="range" min="0" max="100" step="1" value={toolbarCustomY} oninput={(event) => {
                  toolbarCustomY = Number((event.currentTarget as HTMLInputElement).value);
                  void handleBasicChange("toolbarCustomY", toolbarCustomY);
                }} />
              </label>
            </div>
          {/if}
        </div>

        <div class="border-t border-border pt-3.5 sm:pt-4 flex items-center justify-between gap-3 sm:gap-4">
          <div class="space-y-0.5">
            <div class="font-medium text-foreground">{t("lets-more-background.coverBreadcrumbTitle")}</div>
            <p class="text-[11px] text-muted-foreground">{t("lets-more-background.coverBreadcrumbDescription")}</p>
          </div>
          <Switch checked={coverBreadcrumb} onCheckedChange={(value) => {
            coverBreadcrumb = value;
            void handleBasicChange("coverBreadcrumb", value);
          }} />
        </div>

        <div class="border-t border-border pt-3.5 sm:pt-4 flex items-center justify-between gap-3 sm:gap-4">
          <div class="space-y-0.5">
            <div class="font-medium text-foreground">{t("lets-more-background.coverDocumentMenuTitle")}</div>
            <p class="text-[11px] text-muted-foreground">{t("lets-more-background.coverDocumentMenuDescription")}</p>
          </div>
          <Switch checked={coverDocumentMenu} onCheckedChange={(value) => {
            coverDocumentMenu = value;
            void handleBasicChange("coverDocumentMenu", value);
          }} />
        </div>
      </div>
    </Tabs.Content>
  </Tabs.Root>

  <!-- 专门的 Tag 词库批量编辑 / 导入 弹窗窗口 (Shadcn Modal Dialog) -->
  {#if editingPoolIndex !== null}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-150">
      <div class="w-full max-w-2xl rounded-xl border border-border bg-card text-card-foreground shadow-2xl p-4 sm:p-5 space-y-3.5 sm:space-y-4 max-h-[92vh] flex flex-col">
        <!-- 弹窗头部 -->
        <div class="flex items-center justify-between border-b border-border pb-3">
          <div class="flex items-center gap-2">
            <Edit3 class="size-4 text-primary" />
            <h3 class="font-semibold text-sm text-foreground">编辑画师 / Tag 词库</h3>
          </div>
          <Button variant="ghost" size="icon-sm" class="size-7 text-muted-foreground hover:text-foreground" onclick={closePoolEditor}>
            <X class="size-4" />
          </Button>
        </div>

        <!-- 基础信息 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 text-xs">
          <div>
            <Label class="text-xs text-muted-foreground font-medium mb-1.5 block">词库名称</Label>
            <Input bind:value={editingPoolName} placeholder="例如：🎨 常用精选画师池" class="h-8 text-xs bg-background w-full" />
          </div>
          <div>
            <Label class="text-xs text-muted-foreground font-medium mb-1.5 block">描述 / 备注</Label>
            <Input bind:value={editingPoolDesc} placeholder="例如：高画质动漫插画画师" class="h-8 text-xs bg-background w-full" />
          </div>
        </div>

        <!-- 多行编辑区域 -->
        <div class="flex-1 flex flex-col min-h-[180px] sm:min-h-[220px]">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-2">
            <Label class="text-xs text-muted-foreground font-medium">
              词条清单 (每行一个，支持 <code>tag # 中文名</code>)
            </Label>
            <Button
              variant="outline"
              size="sm"
              class="h-6 text-[11px] gap-1 text-primary border-primary/30 hover:bg-primary/10 self-start sm:self-auto"
              onclick={autoTranslateEditorText}
            >
              <Wand2 class="size-3" />
              一键智能匹配中文翻译
            </Button>
          </div>
          <Textarea
            bind:value={editingPoolText}
            rows={10}
            class="flex-1 font-mono text-xs leading-relaxed bg-background resize-none min-h-[140px]"
            placeholder="ask_(askzy) # Ask (画师)&#10;blade_(galaxist) # Blade (画师)&#10;scenery # 唯美风景&#10;night_sky # 璀璨夜空"
          />
        </div>

        <!-- 底部按钮 -->
        <div class="flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" size="sm" class="text-xs font-medium" onclick={closePoolEditor}>
            取消
          </Button>
          <Button variant="secondary" size="sm" class="text-xs gap-1.5 font-medium" onclick={savePoolEditor}>
            <Check class="size-3.5" />
            保存词库
          </Button>
        </div>
      </div>
    </div>
  {/if}

  <!-- JSON 导入/导出弹窗 -->
  {#if jsonModalOpen}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
    >
      <div class="bg-card text-card-foreground border border-border rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">
        <!-- 弹窗标题栏 -->
        <div class="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/40">
          <div class="flex items-center gap-2">
            <FileJson class="size-4 text-primary" />
            <span class="font-semibold text-sm">
              {jsonModalMode === "export" ? "导出预设模板 (JSON)" : "导入预设模板 (JSON)"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            class="size-7 text-muted-foreground hover:text-foreground"
            onclick={closeJsonModal}
          >
            <X class="size-4" />
          </Button>
        </div>

        <!-- 弹窗内容区 -->
        <div class="p-4 space-y-3.5 overflow-y-auto flex-1 text-xs">
          {#if jsonModalMode === "export"}
            <p class="text-muted-foreground leading-relaxed">
              以下是您当前配置的全部条件模板 JSON 数据。您可以直接复制或下载为 <code>.json</code> 文件，用于备份或分享给他人。
            </p>
            <div class="relative">
              <Textarea
                readonly
                value={jsonContent}
                class="font-mono text-xs h-64 bg-background leading-relaxed select-all"
              />
            </div>
          {:else}
            <div class="space-y-3">
              <p class="text-muted-foreground leading-relaxed">
                您可以直接在下方文本框中粘贴模板 JSON 代码，或者点击按钮上传 <code>.json</code> 文件。
              </p>

              <!-- 文件上传控件 -->
              <div class="flex items-center gap-2">
                <input
                  type="file"
                  accept=".json,application/json"
                  class="hidden"
                  bind:this={fileInputRef}
                  onchange={handleFileSelect}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  class="h-7 text-xs gap-1.5"
                  onclick={handleTriggerFileInput}
                >
                  <Upload class="size-3.5" />
                  <span>选择 JSON 文件上传</span>
                </Button>
                {#if fileInputRef?.files?.[0]}
                  <span class="text-xs text-muted-foreground truncate max-w-xs font-mono">
                    {fileInputRef.files[0].name}
                  </span>
                {/if}
              </div>

              <div class="space-y-1.5">
                <Label class="text-xs font-medium">JSON 数据内容：</Label>
                <Textarea
                  value={jsonContent}
                  oninput={(e) => { jsonContent = (e.target as HTMLTextAreaElement).value; importError = ""; }}
                  placeholder="在此粘贴 JSON 文本 (支持单个模板对象、模板数组或完整导出包)..."
                  class="font-mono text-xs h-48 bg-background leading-relaxed"
                />
              </div>

              <!-- 导入模式选择 -->
              <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 rounded-lg bg-muted/40 border border-border p-2.5">
                <span class="text-xs font-medium text-foreground">导入方式：</span>
                <label class="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    value="append"
                    checked={importMode === "append"}
                    onchange={() => (importMode = "append")}
                    class="text-primary focus:ring-primary"
                  />
                  <span>追加到现有模板后面 (推荐)</span>
                </label>
                <label class="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    value="overwrite"
                    checked={importMode === "overwrite"}
                    onchange={() => (importMode = "overwrite")}
                    class="text-destructive focus:ring-destructive"
                  />
                  <span class="text-destructive font-medium">覆盖所有现有模板</span>
                </label>
              </div>

              {#if importError}
                <div class="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                  <XCircle class="size-4 shrink-0" />
                  <span>{importError}</span>
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <!-- 弹窗底部操作按钮 -->
        <div class="flex items-center justify-between border-t border-border px-4 py-3 bg-muted/30">
          <Button variant="ghost" size="sm" onclick={closeJsonModal} class="h-8 text-xs">
            取消
          </Button>

          <div class="flex items-center gap-2">
            {#if jsonModalMode === "export"}
              <Button variant="outline" size="sm" onclick={handleDownloadJson} class="h-8 text-xs gap-1.5">
                <Download class="size-3.5" />
                <span>下载 JSON 文件</span>
              </Button>
              <Button variant="secondary" size="sm" onclick={handleCopyJson} class="h-8 text-xs gap-1.5 font-medium">
                {#if jsonCopied}
                  <Check class="size-3.5 text-emerald-500" />
                  <span class="text-emerald-500">已复制到剪贴板！</span>
                {:else}
                  <Copy class="size-3.5" />
                  <span>复制 JSON</span>
                {/if}
              </Button>
            {:else}
              <Button variant="secondary" size="sm" onclick={handleConfirmImport} class="h-8 text-xs gap-1.5 font-medium">
                <Check class="size-3.5" />
                <span>确认导入</span>
              </Button>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- 模板拖拽排序看板弹窗 -->
  {#if reorderModalOpen}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
    >
      <div class="bg-card text-card-foreground border border-border rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[88vh] animate-in zoom-in-95 duration-150">
        <!-- 弹窗头部 -->
        <div class="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/40">
          <div class="flex items-center gap-2">
            <GripVertical class="size-4 text-primary" />
            <span class="font-semibold text-sm">模板拖拽排序看板</span>
            <Badge variant="outline" class="text-[11px] font-mono px-1.5 py-0">
              共 {reorderItems.length} 个模板
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            class="size-7 text-muted-foreground hover:text-foreground"
            onclick={closeReorderModal}
          >
            <X class="size-4" />
          </Button>
        </div>

        <!-- 说明栏 -->
        <div class="px-4 py-2 bg-muted/20 border-b border-border text-[11px] text-muted-foreground flex items-center justify-between">
          <span>🖐️ 按住左侧手柄拖拽卡片调整顺序（位置越靠前优先级越高，拖拽后自动实时保存生效）。</span>
        </div>

        <!-- 拖拽列表区域 -->
        <div class="p-3.5 space-y-2 overflow-y-auto flex-1">
          <div
            class="space-y-2 focus:outline-none"
            use:dragHandleZone={{
              items: reorderItems,
              flipDurationMs: 160,
              dropTargetClasses: ["opacity-60", "border-primary"],
            }}
            onconsider={handleDndConsider}
            onfinalize={handleDndFinalize}
          >
            {#each reorderItems as item, idx (item.id)}
              <div
                class="flex items-center justify-between gap-2.5 p-2.5 rounded-lg border border-border bg-card hover:border-primary/40 hover:shadow-xs transition-all select-none"
                animate:flip={{ duration: 160 }}
              >
                <!-- 左侧：拖拽手柄 + 序号 + 模板简略信息 -->
                <div class="flex items-center gap-2.5 min-w-0 flex-1">
                  <span
                    use:dragHandle
                    class="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center shrink-0"
                    title="按住拖拽排序"
                    aria-label={`Drag: ${item.name}`}
                  >
                    <GripVertical class="size-4" />
                  </span>

                  <Badge variant="outline" class="font-mono text-xs px-1.5 py-0 shrink-0">
                    #{idx + 1}
                  </Badge>

                  <div class="min-w-0 flex-1 space-y-1">
                    <div class="font-medium text-xs text-foreground truncate flex items-center gap-1.5">
                      <span>{item.name}</span>
                    </div>

                    <!-- 简略标签 / 特征徽章 -->
                    <div class="flex flex-wrap items-center gap-1">
                      <Badge variant="secondary" class="text-[10px] px-1.5 py-0 font-normal">
                        {item.site || (item.type === "preset_api" ? "内置 API" : "自定义 URL")}
                      </Badge>
                      {#if item.aspectRatio && item.aspectRatio !== "any"}
                        <Badge variant="outline" class="text-[10px] px-1.5 py-0 font-normal">
                          {item.aspectRatio === "wide" ? "宽屏 >=1.33" : item.aspectRatio === "landscape" ? "横屏 >=1.0" : "竖屏"}
                        </Badge>
                      {/if}
                      {#if item.imageQuality}
                        <Badge variant="outline" class="text-[10px] px-1.5 py-0 font-normal">
                          {item.imageQuality === "sample" ? "Sample" : item.imageQuality === "preview" ? "Preview" : "Original"}
                        </Badge>
                      {/if}
                      {#if item.minScore !== undefined && item.minScore > 0}
                        <Badge variant="outline" class="text-[10px] px-1.5 py-0 font-normal text-amber-600 dark:text-amber-400">
                          分值 &ge; {item.minScore}
                        </Badge>
                      {/if}
                      {#if item.timeRange && item.timeRange !== "any"}
                        <Badge variant="outline" class="text-[10px] px-1.5 py-0 font-normal text-sky-600 dark:text-sky-400">
                          {item.timeRange}
                        </Badge>
                      {/if}
                      {#if item.tags}
                        <span class="text-[10px] text-muted-foreground font-mono truncate max-w-[140px]">
                          {item.tags}
                        </span>
                      {/if}
                    </div>
                  </div>
                </div>

                <!-- 右侧：置顶与置底快捷按钮 -->
                <div class="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    class="size-6 text-muted-foreground hover:text-foreground"
                    disabled={idx === 0}
                    onclick={() => moveToTop(idx)}
                    title="一键置顶"
                  >
                    <ArrowUp class="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    class="size-6 text-muted-foreground hover:text-foreground"
                    disabled={idx === reorderItems.length - 1}
                    onclick={() => moveToBottom(idx)}
                    title="一键置底"
                  >
                    <ArrowDown class="size-3" />
                  </Button>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <!-- 弹窗底部 -->
        <div class="flex items-center justify-between border-t border-border px-4 py-2.5 bg-muted/30">
          <span class="text-[11px] text-muted-foreground">已同步保存至设置</span>
          <Button variant="secondary" size="sm" onclick={closeReorderModal} class="h-7 text-xs font-medium">
            完成
          </Button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* 基础容器与通用卡片定义 */
  .damophus-card {
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--card);
    color: var(--card-foreground);
    box-shadow: 0 1px 2px color-mix(in srgb, var(--foreground) 4%, transparent);
  }

  /* 选项卡容器与触发器显式重置 (彻底清除 SiYuan 默认 button 边框污染) */
  :global(.more-background-settings .damophus-tabs-list) {
    display: inline-flex !important;
    gap: 3px !important;
    padding: 3px !important;
    border: 1px solid var(--border) !important;
    border-radius: 8px !important;
    background: var(--muted) !important;
  }

  :global(.more-background-settings .damophus-tabs-list [data-slot="tabs-trigger"]) {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border: 0 !important;
    outline: none !important;
    background: transparent !important;
    box-shadow: none !important;
    color: var(--muted-foreground) !important;
    border-radius: 6px !important;
    font-size: 12px !important;
    font-weight: 500 !important;
    cursor: pointer !important;
    transition: background-color 150ms ease, color 150ms ease, box-shadow 150ms ease !important;
  }

  :global(.more-background-settings .damophus-tabs-list [data-slot="tabs-trigger"]:hover) {
    color: var(--foreground) !important;
  }

  :global(.more-background-settings .damophus-tabs-list [data-slot="tabs-trigger"][data-state="active"]) {
    background: var(--background) !important;
    color: var(--foreground) !important;
    font-weight: 600 !important;
    box-shadow: 0 1px 2px color-mix(in srgb, var(--foreground) 10%, transparent) !important;
  }

  /* 分段切换按钮 (Segmented Control) */
  .damophus-segmented {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: 7px;
    background: var(--muted);
    border: 1px solid var(--border);
  }

  .damophus-segmented__item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 5px;
    border: 0 !important;
    outline: none !important;
    background: transparent !important;
    box-shadow: none !important;
    color: var(--muted-foreground) !important;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 150ms ease, color 150ms ease, box-shadow 150ms ease;
  }

  .damophus-segmented__item:hover {
    color: var(--foreground) !important;
  }

  .damophus-segmented__item--active {
    background: var(--background) !important;
    color: var(--foreground) !important;
    font-weight: 600;
    box-shadow: 0 1px 2px color-mix(in srgb, var(--foreground) 10%, transparent) !important;
  }

  /* 精致的 Tag 胶囊药丸 */
  .damophus-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 9999px;
    border: 1px solid var(--border);
    background: var(--background);
    color: var(--foreground);
    font-size: 12px;
    transition: border-color 150ms ease, background-color 150ms ease;
  }

  .damophus-chip:hover {
    border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
    background: color-mix(in srgb, var(--muted) 45%, var(--background));
  }

  .damophus-chip__tag {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    font-weight: 500;
  }

  .damophus-chip__zh {
    display: inline-flex;
    align-items: center;
    padding: 1px 5px;
    border-radius: 9999px;
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary);
    font-size: 10px;
    font-weight: 600;
    line-height: 1.2;
  }

  /* Tag 删除小按钮 (完全清除任何原生边框与背景) */
  .damophus-chip-delete {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    border: 0 !important;
    outline: none !important;
    background: transparent !important;
    box-shadow: none !important;
    padding: 0 !important;
    margin: 0 0 0 1px !important;
    width: 14px !important;
    height: 14px !important;
    border-radius: 9999px !important;
    color: var(--muted-foreground) !important;
    cursor: pointer !important;
    transition: color 150ms ease, background-color 150ms ease !important;
  }

  .damophus-chip-delete:hover {
    color: var(--destructive) !important;
    background: color-mix(in srgb, var(--destructive) 15%, transparent) !important;
  }

  /* 统一规范的下拉选择框 (Select) */
  .damophus-select {
    height: 28px;
    padding: 0 8px;
    border-radius: 6px;
    border: 1px solid var(--border) !important;
    background-color: var(--background) !important;
    color: var(--foreground) !important;
    font-size: 12px;
    outline: none;
    cursor: pointer;
    transition: border-color 150ms ease, box-shadow 150ms ease;
  }

  .damophus-select:focus {
    border-color: var(--ring) !important;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--ring) 25%, transparent) !important;
  }

  .damophus-select option {
    background-color: var(--background) !important;
    color: var(--foreground) !important;
  }

  /* 移动端细化响应式适配 */
  @media (max-width: 640px) {
    :global(.more-background-settings .damophus-tabs-list) {
      padding: 2px !important;
      gap: 2px !important;
    }

    :global(.more-background-settings .damophus-tabs-list [data-slot="tabs-trigger"]) {
      padding: 6px 4px !important;
    }

    .damophus-chip {
      padding: 3px 7px;
    }

    .damophus-chip-delete {
      width: 16px !important;
      height: 16px !important;
    }

    .damophus-select {
      height: 32px;
    }
  }
</style>
