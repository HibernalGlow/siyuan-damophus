<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import {
    ArrowDown,
    ArrowUp,
    CheckCircle2,
    Eye,
    Key,
    Layers,
    Plus,
    RefreshCw,
    Sliders,
    Trash2,
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
    DEFAULT_TEMPLATES,
    templateToUrl,
    type AspectRatioType,
    type CoverTemplateItem,
    type SiteCredential,
  } from "./sources";
  import {
    resolveBooruImageUrl,
    testBooruSiteCredential,
  } from "./booru";
  import { plugin } from "@/utils";

  export let group = "moreBackground";
  export let title = "题头图Plus";
  export let templates: CoverTemplateItem[] = [];
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

  function t(key: string, fallback?: string): string {
    return (plugin.i18n as any)[key] || fallback || key;
  }

  $: normalizedTemplates =
    templates && templates.length > 0 ? templates : DEFAULT_TEMPLATES;
  $: normalizedCredentials =
    siteCredentials && siteCredentials.length > 0
      ? siteCredentials
      : DEFAULT_SITE_CREDENTIALS;

  function syncChanges(
    nextTemplates: CoverTemplateItem[],
    nextCredentials: SiteCredential[],
  ) {
    templates = nextTemplates;
    siteCredentials = nextCredentials;

    // Convert templates to sources for legacy compatibility
    const sources = nextTemplates.map((tpl) => ({
      label: tpl.name,
      url: templateToUrl(tpl),
    }));

    dispatch("changed", { group, key: "templates", value: nextTemplates });
    dispatch("changed", { group, key: "siteCredentials", value: nextCredentials });
    dispatch("changed", { group, key: "sources", value: sources });
  }

  function updateTemplate(index: number, patch: Partial<CoverTemplateItem>) {
    const next = normalizedTemplates.map((item, i) =>
      i === index ? { ...item, ...patch } : item,
    );
    syncChanges(next, normalizedCredentials);
  }

  function addTemplate() {
    const newTpl: CoverTemplateItem = {
      id: `tpl-${Date.now()}`,
      name: `新条件模板 ${normalizedTemplates.length + 1}`,
      type: "booru",
      site: "safebooru.org",
      aspectRatio: "landscape",
      rating: "safe",
      tags: "wallpaper",
      pool: [],
    };
    syncChanges([...normalizedTemplates, newTpl], normalizedCredentials);
  }

  function removeTemplate(index: number) {
    const next = normalizedTemplates.filter((_, i) => i !== index);
    syncChanges(next, normalizedCredentials);
  }

  function moveTemplate(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= normalizedTemplates.length) return;
    const next = [...normalizedTemplates];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    syncChanges(next, normalizedCredentials);
  }

  function resetDefaultTemplates() {
    syncChanges(DEFAULT_TEMPLATES, normalizedCredentials);
  }

  async function testTemplate(template: CoverTemplateItem) {
    testingTemplateId = template.id;
    templateTestResults[template.id] = undefined as any;
    try {
      const url = templateToUrl(template);
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

  function updateCredential(index: number, patch: Partial<SiteCredential>) {
    const next = normalizedCredentials.map((item, i) =>
      i === index ? { ...item, ...patch } : item,
    );
    syncChanges(normalizedTemplates, next);
  }

  function addCredential() {
    const newCred: SiteCredential = {
      id: `cred-${Date.now()}`,
      site: "danbooru.donmai.us",
      login: "",
      apiKey: "",
      enabled: true,
    };
    syncChanges(normalizedTemplates, [...normalizedCredentials, newCred]);
  }

  function removeCredential(index: number) {
    const next = normalizedCredentials.filter((_, i) => i !== index);
    syncChanges(normalizedTemplates, next);
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
    { id: "landscape", label: "🖼️ 横屏", desc: "ratio >= 1.0 (推荐题头图)" },
    { id: "wide", label: "📐 宽屏", desc: "ratio >= 1.33 (超宽横幅)" },
    { id: "portrait", label: "📱 竖屏", desc: "ratio < 1.0" },
    { id: "any", label: "🔄 任意", desc: "不限制比例" },
  ];

  const BOORU_SITES = [
    { id: "safebooru.org", label: "Safebooru (公开免密·安全推荐)" },
    { id: "danbooru.donmai.us", label: "Danbooru (高质量·支持API Key)" },
    { id: "yande.re", label: "Yande.re (高清插画·高质量)" },
    { id: "konachan.com", label: "Konachan (壁纸精选)" },
    { id: "gelbooru.com", label: "Gelbooru (海量资源)" },
    { id: "e621.net", label: "E621" },
    { id: "tbib.org", label: "The Big ImageBoard (TBIB)" },
  ];
</script>

<div class="more-background-settings flex flex-col gap-5 p-1" class:mobile>
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
    <Tabs.List class="grid w-full grid-cols-3 max-w-md">
      <Tabs.Trigger value="templates" class="gap-1.5 text-xs">
        <Layers class="size-3.5" />
        {t("lets-more-background.templatesTab", "条件模板与图源")}
      </Tabs.Trigger>
      <Tabs.Trigger value="credentials" class="gap-1.5 text-xs">
        <Key class="size-3.5" />
        {t("lets-more-background.credentialsTab", "多站点 API 凭据")}
      </Tabs.Trigger>
      <Tabs.Trigger value="basic" class="gap-1.5 text-xs">
        <Sliders class="size-3.5" />
        {t("lets-more-background.basicTab", "基础与存储设置")}
      </Tabs.Trigger>
    </Tabs.List>

    <!-- Tab 1: 条件模板与图源 -->
    <Tabs.Content value="templates" class="mt-4 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="text-xs text-muted-foreground">
          已配置 <span class="font-semibold text-foreground">{normalizedTemplates.length}</span> 个图源条件模板，点击题头图按钮可一键选用。
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" onclick={resetDefaultTemplates} class="text-xs">
            <RefreshCw class="size-3.5 mr-1" />
            恢复预设模板
          </Button>
          <Button size="sm" onclick={addTemplate} class="text-xs">
            <Plus class="size-3.5 mr-1" />
            {t("lets-more-background.addTemplate", "添加新模板")}
          </Button>
        </div>
      </div>

      <div class="space-y-4">
        {#each normalizedTemplates as template, index (template.id || index)}
          <div class="rounded-lg border border-border bg-card/60 p-4 shadow-sm transition-all hover:border-border/80">
            <!-- 模板卡片头部 -->
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
              <div class="flex flex-1 items-center gap-2 min-w-[220px]">
                <Input
                  bind:value={template.name}
                  oninput={() => updateTemplate(index, { name: template.name })}
                  placeholder={t("lets-more-background.templateName", "模板名称")}
                  class="font-medium text-sm h-8"
                />
              </div>

              <!-- 排序与删除 -->
              <div class="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === 0}
                  onclick={() => moveTemplate(index, "up")}
                  title="上移"
                >
                  <ArrowUp class="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === normalizedTemplates.length - 1}
                  onclick={() => moveTemplate(index, "down")}
                  title="下移"
                >
                  <ArrowDown class="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="text-destructive hover:bg-destructive/10"
                  onclick={() => removeTemplate(index)}
                  title="删除"
                >
                  <Trash2 class="size-3.5" />
                </Button>
              </div>
            </div>

            <!-- 模板卡片内容表单 -->
            <div class="mt-3 grid gap-3 text-xs">
              <!-- 图源类型单选 -->
              <div class="flex flex-wrap items-center gap-4">
                <span class="font-medium text-muted-foreground w-20">图源类型:</span>
                <div class="flex flex-wrap items-center gap-2">
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`type-${template.id}`}
                      value="booru"
                      checked={template.type === "booru"}
                      onchange={() => updateTemplate(index, { type: "booru" })}
                      class="text-primary"
                    />
                    <span>🎨 Booru 条件规则 (推荐)</span>
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`type-${template.id}`}
                      value="preset_api"
                      checked={template.type === "preset_api"}
                      onchange={() => updateTemplate(index, { type: "preset_api" })}
                      class="text-primary"
                    />
                    <span>🌍 预设在线 API</span>
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name={`type-${template.id}`}
                      value="custom_url"
                      checked={template.type === "custom_url"}
                      onchange={() => updateTemplate(index, { type: "custom_url" })}
                      class="text-primary"
                    />
                    <span>🔗 自定义直接 URL</span>
                  </label>
                </div>
              </div>

              {#if template.type === "booru"}
                <!-- 目标站点与安全分级 -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label class="text-xs text-muted-foreground mb-1 block">目标 Booru 站点</Label>
                    <select
                      value={template.site || "safebooru.org"}
                      onchange={(e) => updateTemplate(index, { site: (e.target as HTMLSelectElement).value })}
                      class="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {#each BOORU_SITES as site}
                        <option value={site.id}>{site.label}</option>
                      {/each}
                    </select>
                  </div>

                  <div>
                    <Label class="text-xs text-muted-foreground mb-1 block">安全分级 (Rating)</Label>
                    <select
                      value={template.rating || "safe"}
                      onchange={(e) => updateTemplate(index, { rating: (e.target as any).value })}
                      class="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="safe">Safe (仅安全·适合日常)</option>
                      <option value="general">General (常规通用)</option>
                      <option value="questionable">Questionable (性感/擦边)</option>
                      <option value="all">All (包含全部)</option>
                    </select>
                  </div>
                </div>

                <!-- 画面比例智能过滤 (重点功能) -->
                <div>
                  <Label class="text-xs text-muted-foreground mb-1.5 block">画面比例过滤 (Aspect Ratio)</Label>
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {#each RATIO_OPTIONS as opt}
                      <label
                        class="flex items-center justify-between rounded-md border px-3 py-2 cursor-pointer transition-colors text-xs"
                        class:border-primary={template.aspectRatio === opt.id}
                        class:bg-primary-50={(template.aspectRatio || "landscape") === opt.id}
                      >
                        <div class="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name={`ratio-${template.id}`}
                            value={opt.id}
                            checked={(template.aspectRatio || "landscape") === opt.id}
                            onchange={() => updateTemplate(index, { aspectRatio: opt.id })}
                            class="text-primary"
                          />
                          <span class="font-medium">{opt.label}</span>
                        </div>
                      </label>
                    {/each}
                  </div>
                  <p class="text-[11px] text-muted-foreground mt-1">
                    设置为「横屏」或「宽屏」时，会自动过滤掉竖屏长图，100% 确保返回符合题头图版式的横向图片。
                  </p>
                </div>

                <!-- 固定标签与最低评分 -->
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div class="sm:col-span-2">
                    <Label class="text-xs text-muted-foreground mb-1 block">固定标签 Tags (空格分隔)</Label>
                    <Input
                      value={template.tags || ""}
                      oninput={(e) => updateTemplate(index, { tags: (e.target as HTMLInputElement).value })}
                      placeholder="wallpaper scenery highres"
                      class="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label class="text-xs text-muted-foreground mb-1 block">最低评分 (Min Score)</Label>
                    <Input
                      type="number"
                      value={template.minScore ?? ""}
                      oninput={(e) => updateTemplate(index, { minScore: parseInt((e.target as HTMLInputElement).value, 10) || undefined })}
                      placeholder="例如 5"
                      class="h-8 text-xs"
                    />
                  </div>
                </div>

                <!-- 画师/Tag 随机候选池 (多行文本框) -->
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <Label class="text-xs font-medium text-foreground">
                      画师 / Tag 随机候选池 (Candidate Pool)
                    </Label>
                    <span class="text-[11px] text-muted-foreground">
                      当前共 {(template.pool || []).length} 个候选项
                    </span>
                  </div>
                  <Textarea
                    value={(template.pool || []).join("\n")}
                    oninput={(e) => {
                      const lines = (e.target as HTMLTextAreaElement).value
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean);
                      updateTemplate(index, { pool: lines });
                    }}
                    placeholder={t("lets-more-background.poolPlaceholder")}
                    rows={4}
                    class="font-mono text-xs"
                  />
                  <p class="text-[11px] text-muted-foreground mt-1">
                    每行输入一个画师或 Tag（例如 <code>ask_(askzy)</code>、<code>@blade (galaxist)</code>）。每次触发时，会自动从列表中随机抽取 1 个画师并强制执行横屏等筛选。
                  </p>
                </div>
              {:else}
                <!-- 预设 API 或 自定义直接 URL -->
                <div>
                  <Label class="text-xs text-muted-foreground mb-1 block">图片 URL / API 链接</Label>
                  <Input
                    bind:value={template.url}
                    oninput={() => updateTemplate(index, { url: template.url })}
                    placeholder="https://..."
                    class="h-8 text-xs font-mono"
                  />
                  <p class="text-[11px] text-muted-foreground mt-1">
                    支持 <code>&#123;width&#125;</code> 与 <code>&#123;height&#125;</code> 尺寸占位符。
                  </p>
                </div>
              {/if}

              <!-- 卡片底部：测试出图按钮与实时预览 -->
              <div class="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 p-2.5">
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

    <!-- Tab 2: 多站点 API 凭据 -->
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

    <!-- Tab 3: 基础与存储设置 -->
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
</div>
