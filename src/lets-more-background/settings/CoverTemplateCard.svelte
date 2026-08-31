<script lang="ts">
  import { CheckCircle2, Eye, ExternalLink, Image, Link2, Globe, Loader2, Palette, Tag, Trash2, XCircle } from "lucide-svelte";
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import CoverTemplateConditionEditor from "../CoverTemplateConditionEditor.svelte";
  import { openCoverTagViewer } from "../tag-viewer";
  import { fetchImageForPreview, resolveBooruImageInfo } from "../booru";
  import { templateToUrl, type CoverTemplateItem, type FilterRule, type SiteCredential, type TagPool } from "../sources";

  export let label: (key: string, fallback: string) => string;
  export let template: CoverTemplateItem;
  export let tagPools: TagPool[] = [];
  export let siteCredentials: SiteCredential[] = [];
  export let writeToAssets = false;
  export let onUpdate: (patch: Partial<CoverTemplateItem>) => void;
  export let onRemove: () => void;
  export let onApplyRules: (rules: FilterRule[]) => void;

  type TestResult = {
    success: boolean;
    url?: string;
    error?: string;
    displayUrl?: string;
    postUrl?: string;
    postId?: string | number;
    site?: string;
    width?: number;
    height?: number;
    score?: number;
    tags?: string[] | string;
  };

  let testing = false;
  let result: TestResult | undefined;
  let imageLoadError = false;

  async function test() {
    testing = true;
    result = undefined;
    imageLoadError = false;
    try {
      const url = templateToUrl(template, tagPools);
      const res = await resolveBooruImageInfo(url, siteCredentials);
      if (res && res.imageUrl) {
        // 与实际设置题头图机制保持一致：writeToAssets 时代理下载，否则浏览器直连。
        let displayUrl = res.imageUrl;
        if (writeToAssets) {
          displayUrl = await fetchImageForPreview(res.imageUrl);
        }
        result = {
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
        result = { success: false, error: label("lets-more-background.testFailed", "未找到符合条件的图片或网络超时") };
      }
    } catch (e: any) {
      result = { success: false, error: e?.message || String(e) };
    } finally {
      testing = false;
    }
  }

  function tagCount(tags: string[] | string | undefined): number {
    if (Array.isArray(tags)) return tags.length;
    return String(tags || "").trim() ? String(tags).split(/\s+/).filter(Boolean).length : 0;
  }
</script>

<article class="mb-card">
  <header class="mb-card-head">
    <Input
      value={template.name || ""}
      oninput={(e) => onUpdate({ name: (e.target as HTMLInputElement).value })}
      placeholder={label("lets-more-background.templateName", "模板名称")}
      class="h-8 min-w-0 flex-1 bg-background text-sm font-medium"
      aria-label={label("lets-more-background.templateName", "模板名称")}
    />
    <Button
      variant="ghost"
      size="icon-sm"
      class="size-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      onclick={onRemove}
      title={label("lets-more-background.removeTemplate", "删除模板")}
      aria-label={label("lets-more-background.removeTemplate", "删除模板")}
    >
      <Trash2 class="size-4" />
    </Button>
  </header>

  <div class="mb-card-body">
    <div>
      <Label class="mb-field-label">{label("lets-more-background.sourceType", "图源类型")}</Label>
      <div class="mb-segmented" role="radiogroup" aria-label={label("lets-more-background.sourceType", "图源类型")}>
        <button type="button" role="radio" aria-checked={template.type === "booru"} onclick={() => onUpdate({ type: "booru" })}>
          <Palette class="size-3.5" />
          <span>Booru</span>
        </button>
        <button type="button" role="radio" aria-checked={template.type === "preset_api"} onclick={() => onUpdate({ type: "preset_api" })}>
          <Globe class="size-3.5" />
          <span>{label("lets-more-background.sourceTypeApi", "在线 API")}</span>
        </button>
        <button type="button" role="radio" aria-checked={template.type === "custom_url"} onclick={() => onUpdate({ type: "custom_url" })}>
          <Link2 class="size-3.5" />
          <span>URL</span>
        </button>
      </div>
    </div>

    {#if template.type === "booru"}
      <CoverTemplateConditionEditor
        label={(key, fallback) => label(`lets-more-background.${key}`, fallback)}
        rules={template.rules ?? []}
        {tagPools}
        onApply={onApplyRules}
      />
    {:else}
      <div>
        <Label class="mb-field-label">{label("lets-more-background.customUrlLabel", "图片 URL / API 接口地址")}</Label>
        <Input
          value={template.url || ""}
          oninput={(e) => onUpdate({ url: (e.target as HTMLInputElement).value })}
          placeholder="https://..."
          class="h-8 bg-background font-mono text-xs"
        />
        <p class="mb-field-hint">
          {label("lets-more-background.customUrlHint", "支持 {width} 与 {height} 尺寸占位符替换。")}
        </p>
      </div>
    {/if}

    <div class="test-row">
      <Button variant="outline" size="sm" class="gap-1.5 font-medium" disabled={testing} onclick={test}>
        {#if testing}
          <Loader2 class="size-3.5 animate-spin" />
          <span>{label("lets-more-background.testing", "测试中...")}</span>
        {:else}
          <Eye class="size-3.5" />
          <span>{label("lets-more-background.testTemplateBtn", "测试出图并预览")}</span>
        {/if}
      </Button>
      {#if result}
        {#if result.success}
          <Badge variant="secondary" class="gap-1.5 border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 class="size-3.5" />
            <span>{label("lets-more-background.testSuccess", "测试成功")}</span>
          </Badge>
        {:else}
          <Badge variant="destructive" class="gap-1.5 px-2.5 py-1 text-xs font-medium">
            <XCircle class="size-3.5" />
            <span class="mb-truncate max-w-[200px]">{result.error}</span>
          </Badge>
        {/if}
      {/if}
    </div>

    {#if result?.success && result.url}
      <div class="preview-block">
        <div class="preview-meta">
          <span class="flex min-w-0 flex-wrap items-center gap-1.5">
            <Image class="size-3.5 text-primary" aria-hidden="true" />
            <span class="font-medium">{label("lets-more-background.previewImage", "获取到的图片预览")}</span>
            {#if result.width && result.height}
              <span class="mb-mono text-[10px] text-muted-foreground/80">({result.width} × {result.height})</span>
            {/if}
          </span>
          <span class="preview-links">
            {#if result.tags && tagCount(result.tags) > 0}
              <Button
                variant="outline"
                size="sm"
                class="gap-1 border-primary/30 px-2 py-0 text-xs text-primary hover:bg-primary/10"
                onclick={() => {
                  openCoverTagViewer({
                    site: result!.site,
                    postId: result!.postId,
                    postUrl: result!.postUrl,
                    tags: result!.tags,
                    score: result!.score,
                    width: result!.width,
                    height: result!.height,
                  });
                }}
              >
                <Tag class="size-3" />
                <span>{label("lets-more-background.viewTags", "查看 Tag")} ({tagCount(result.tags)})</span>
              </Button>
            {/if}
            {#if result.postUrl}
              <a href={result.postUrl} target="_blank" rel="noopener noreferrer" class="post-link" title={label("lets-more-background.openPostHint", "跳转至原贴查看全量标签、画师与原作详情")}>
                <ExternalLink class="size-3" />
                <span>{label("lets-more-background.openPost", "打开原帖")}{#if result.postId}&nbsp;#{result.postId}{/if}</span>
              </a>
            {/if}
            <a href={result.url} target="_blank" rel="noopener noreferrer" class="direct-link">
              <span>{label("lets-more-background.originalUrl", "原图直链")}</span>
              <span aria-hidden="true">↗</span>
            </a>
          </span>
        </div>
        <div class="preview-frame">
          {#if imageLoadError}
            <div class="preview-error">
              <p class="m-0 flex items-center justify-center gap-1.5 font-semibold">
                <XCircle class="size-4" />
                <span>{label("lets-more-background.previewLoadFailed", "浏览器直链加载失败（防盗链拦截）")}</span>
              </p>
              <p class="mx-auto max-w-lg text-[11px] leading-relaxed text-muted-foreground">
                {@html label(
                  "lets-more-background.previewLoadFailedHint",
                  "该站点官方 CDN 限制了浏览器直链嵌入。可在「基础与存储设置」中开启<b>保存题头图到资源目录</b>，或改用 Safebooru.org、Yande.re、Konachan 等免防盗链图源。",
                )}
              </p>
            </div>
          {:else}
            <img
              src={result.displayUrl || result.url}
              alt={label("lets-more-background.previewImage", "获取到的图片预览")}
              referrerpolicy="no-referrer"
              onerror={() => (imageLoadError = true)}
            />
          {/if}
        </div>
      </div>
    {/if}
  </div>
</article>

<style>
  .test-row {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 9px;
    background: color-mix(in srgb, var(--b3-theme-surface) 55%, var(--b3-theme-background));
  }

  .preview-block {
    display: grid;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 9px;
    background: var(--b3-theme-background);
  }

  .preview-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 6px;
    color: var(--b3-theme-on-surface);
    font-size: 11px;
  }

  .preview-links {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .post-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
    color: var(--b3-theme-primary);
    font-size: 11.5px;
    font-weight: 500;
    white-space: nowrap;
  }

  .post-link:hover {
    background: color-mix(in srgb, var(--b3-theme-primary) 20%, transparent);
  }

  .direct-link {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--b3-theme-on-surface);
    font-size: 11.5px;
    white-space: nowrap;
  }

  .direct-link:hover {
    color: var(--b3-theme-on-background);
  }

  .preview-frame {
    max-height: 288px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    background: var(--b3-theme-background);
  }

  .preview-frame img {
    max-height: 288px;
    width: 100%;
    object-fit: cover;
  }

  .preview-error {
    width: 100%;
    padding: 16px;
    display: grid;
    gap: 6px;
    text-align: center;
    color: var(--b3-theme-error);
    font-size: 12px;
    background: color-mix(in srgb, var(--b3-theme-error) 8%, transparent);
  }

  @container mbframe (max-width: 760px) {
    .test-row :global(button) {
      min-height: 38px;
    }

    .test-row {
      justify-content: flex-start;
    }

    .preview-frame,
    .preview-frame img {
      max-height: 220px;
    }
  }
</style>
