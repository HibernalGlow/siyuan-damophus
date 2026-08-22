<script lang="ts">
  import { onMount } from "svelte";
  import {
    Check,
    Copy,
    ExternalLink,
    Globe,
    Hash,
    Loader2,
    Maximize2,
    RefreshCw,
    Search,
    Star,
    Tag,
    X,
  } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { getDetailedTagInfo, type TagDefinition } from "./tag-dictionary";
  import { batchResolveTagsOnline } from "./tag-translation-service";

  export let site: string = "";
  export let postId: string | number = "";
  export let postUrl: string = "";
  export let tags: string[] | string = [];
  export let width: number | string = "";
  export let height: number | string = "";
  export let score: number | string = "";
  export let onclose: (() => void) | undefined = undefined;

  let searchQuery = "";
  let selectedCategory:
    | "all"
    | "artist"
    | "copyright"
    | "character"
    | "scenery"
    | "style"
    | "general" = "all";

  let copiedTag: string | null = null;
  let copiedBatchType: string | null = null;
  let isTranslatingOnline = false;
  let refreshVersion = 0;

  $: rawTagList = Array.isArray(tags)
    ? tags
    : typeof tags === "string"
    ? tags.split(/\s+/).filter(Boolean)
    : [];

  // 依赖 refreshVersion 以在网络翻译异步返回后重新计算中文字段
  $: processedTags = refreshVersion >= 0 ? rawTagList.map((t) => getDetailedTagInfo(t)) : [];

  $: filteredTags = processedTags.filter((item) => {
    if (selectedCategory !== "all" && item.category !== selectedCategory) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      item.tag.toLowerCase().includes(q) || item.zh.toLowerCase().includes(q)
    );
  });

  $: categoryCounts = {
    all: processedTags.length,
    artist: processedTags.filter((t) => t.category === "artist").length,
    copyright: processedTags.filter((t) => t.category === "copyright").length,
    character: processedTags.filter((t) => t.category === "character").length,
    scenery: processedTags.filter((t) => t.category === "scenery").length,
    style: processedTags.filter((t) => t.category === "style").length,
    general: processedTags.filter((t) => t.category === "general").length,
  };

  $: isValidScore =
    score !== undefined &&
    score !== null &&
    score !== "" &&
    score !== "null" &&
    score !== "undefined";

  async function handleAutoTranslate() {
    if (isTranslatingOnline) return;
    isTranslatingOnline = true;
    try {
      await batchResolveTagsOnline(rawTagList);
      refreshVersion++;
    } catch {}
    finally {
      isTranslatingOnline = false;
    }
  }

  onMount(() => {
    // 检查是否有缺失中文的 tag，如有则自动联网补全
    const hasUntranslated = rawTagList.some((t) => {
      const info = getDetailedTagInfo(t);
      return !info.zh || info.zh.toLowerCase() === t.toLowerCase().replace(/_/g, " ");
    });
    if (hasUntranslated) {
      void handleAutoTranslate();
    }
  });

  async function copyText(text: string) {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }

  async function handleCopyTag(tagItem: TagDefinition) {
    await copyText(tagItem.tag);
    copiedTag = tagItem.tag;
    setTimeout(() => {
      if (copiedTag === tagItem.tag) copiedTag = null;
    }, 1500);
  }

  async function handleCopyAllRaw() {
    const text = processedTags.map((t) => t.tag).join(" ");
    await copyText(text);
    copiedBatchType = "raw";
    setTimeout(() => {
      copiedBatchType = null;
    }, 2000);
  }

  async function handleCopyAllWithZh() {
    const text = processedTags.map((t) => `${t.tag} # ${t.zh}`).join("\n");
    await copyText(text);
    copiedBatchType = "zh";
    setTimeout(() => {
      copiedBatchType = null;
    }, 2000);
  }

  function getCategoryBadgeClass(cat?: string) {
    switch (cat) {
      case "artist":
        return "bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20";
      case "copyright":
        return "bg-purple-500/10 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30 hover:bg-purple-500/20";
      case "character":
        return "bg-sky-500/10 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30 hover:bg-sky-500/20";
      case "scenery":
        return "bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20";
      case "style":
        return "bg-pink-500/10 dark:bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30 hover:bg-pink-500/20";
      default:
        return "bg-muted/50 dark:bg-muted/60 text-foreground/85 hover:text-foreground hover:bg-muted border-border/45";
    }
  }
</script>

<div class="damophus-shadcn-tag-viewer flex flex-col h-full bg-background text-foreground select-none">
  <!-- 顶部元信息栏 (柔和胶囊设计) -->
  <div class="px-5 py-3 border-b border-border/40 bg-muted/20 flex flex-wrap items-center justify-between gap-3 shrink-0">
    <div class="flex flex-wrap items-center gap-2 text-xs">
      <span class="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-muted/80 text-foreground border border-border/40 shadow-2xs">
        <Tag class="size-3 text-primary" />
        <span>共 {processedTags.length} 个标签</span>
      </span>

      {#if site}
        <span class="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full bg-muted/40 text-muted-foreground border border-border/40">
          <Globe class="size-3 text-muted-foreground" />
          <span>{site}</span>
        </span>
      {/if}

      {#if postId}
        <span class="inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-0.5 rounded-full bg-muted/40 text-muted-foreground border border-border/40">
          <Hash class="size-3 text-muted-foreground" />
          <span>{postId}</span>
        </span>
      {/if}

      {#if width && height}
        <span class="inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-0.5 rounded-full bg-muted/40 text-muted-foreground border border-border/40">
          <Maximize2 class="size-3 text-muted-foreground" />
          <span>{width} × {height}</span>
        </span>
      {/if}

      {#if isValidScore}
        <span class="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-mono text-[11px] px-2.5 py-0.5 rounded-full border border-amber-500/25 bg-amber-500/10">
          <Star class="size-3 fill-current" />
          <span>评分 {score}</span>
        </span>
      {/if}
    </div>

    <div class="flex items-center gap-2">
      <!-- 联网补全翻译按钮 -->
      <Button
        variant="ghost"
        size="sm"
        class="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground rounded-full px-3"
        onclick={handleAutoTranslate}
        disabled={isTranslatingOnline}
        title="联网匹配官方词库与补全翻译"
      >
        {#if isTranslatingOnline}
          <Loader2 class="size-3 animate-spin text-primary" />
          <span class="text-[11px] text-primary font-medium">翻译中...</span>
        {:else}
          <RefreshCw class="size-3" />
          <span class="text-[11px]">联网补全翻译</span>
        {/if}
      </Button>

      {#if postUrl}
        <Button
          variant="ghost"
          size="sm"
          class="h-7 text-xs gap-1.5 text-primary hover:text-primary hover:bg-primary/10 rounded-full px-3"
          onclick={() => window.open(postUrl, "_blank")}
        >
          <ExternalLink class="size-3.5" />
          <span>在原站打开 ↗</span>
        </Button>
      {/if}
    </div>
  </div>

  <!-- 搜索框与 Segmented 分类药丸 -->
  <div class="px-5 py-3.5 border-b border-border/40 space-y-3 bg-muted/10 shrink-0">
    <!-- 实时搜索输入框 (圆角药丸搜索栏) -->
    <div class="relative flex items-center">
      <Search class="size-3.5 absolute left-3.5 text-muted-foreground/70 pointer-events-none" />
      <Input
        bind:value={searchQuery}
        placeholder="搜索 Tag 英文名、画师、原作或官方中文翻译..."
        class="h-8.5 text-xs pl-9 pr-8 bg-background border-border/50 rounded-full focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:border-primary shadow-2xs"
      />
      {#if searchQuery}
        <button
          class="absolute right-3 text-muted-foreground hover:text-foreground p-0.5 rounded-full transition-colors cursor-pointer"
          onclick={() => (searchQuery = "")}
        >
          <X class="size-3.5" />
        </button>
      {/if}
    </div>

    <!-- Segmented Tabs 风格分类筛选药丸栏 -->
    <div class="flex flex-wrap items-center gap-1.5 p-1 bg-muted/40 rounded-full border border-border/40 text-xs">
      <button
        class="px-3 py-1 rounded-full text-xs transition-all cursor-pointer font-medium
        {selectedCategory === 'all'
          ? 'bg-background text-foreground shadow-2xs border border-border/50'
          : 'text-muted-foreground hover:text-foreground hover:bg-background/40'}"
        onclick={() => (selectedCategory = "all")}
      >
        全部 ({categoryCounts.all})
      </button>

      {#if categoryCounts.artist > 0}
        <button
          class="px-3 py-1 rounded-full text-xs transition-all cursor-pointer font-medium
          {selectedCategory === 'artist'
            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/35 shadow-2xs'
            : 'text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-500/10'}"
          onclick={() => (selectedCategory = "artist")}
        >
          🎨 画师 ({categoryCounts.artist})
        </button>
      {/if}

      {#if categoryCounts.copyright > 0}
        <button
          class="px-3 py-1 rounded-full text-xs transition-all cursor-pointer font-medium
          {selectedCategory === 'copyright'
            ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/35 shadow-2xs'
            : 'text-muted-foreground hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-500/10'}"
          onclick={() => (selectedCategory = "copyright")}
        >
          🌸 原作 ({categoryCounts.copyright})
        </button>
      {/if}

      {#if categoryCounts.character > 0}
        <button
          class="px-3 py-1 rounded-full text-xs transition-all cursor-pointer font-medium
          {selectedCategory === 'character'
            ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/35 shadow-2xs'
            : 'text-muted-foreground hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-500/10'}"
          onclick={() => (selectedCategory = "character")}
        >
          👤 角色 ({categoryCounts.character})
        </button>
      {/if}

      {#if categoryCounts.scenery > 0}
        <button
          class="px-3 py-1 rounded-full text-xs transition-all cursor-pointer font-medium
          {selectedCategory === 'scenery'
            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/35 shadow-2xs'
            : 'text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/10'}"
          onclick={() => (selectedCategory = "scenery")}
        >
          🖼️ 场景 ({categoryCounts.scenery})
        </button>
      {/if}

      {#if categoryCounts.style > 0}
        <button
          class="px-3 py-1 rounded-full text-xs transition-all cursor-pointer font-medium
          {selectedCategory === 'style'
            ? 'bg-pink-500/15 text-pink-700 dark:text-pink-300 border border-pink-500/35 shadow-2xs'
            : 'text-muted-foreground hover:text-pink-600 dark:hover:text-pink-400 hover:bg-pink-500/10'}"
          onclick={() => (selectedCategory = "style")}
        >
          🎭 风格 ({categoryCounts.style})
        </button>
      {/if}

      {#if categoryCounts.general > 0}
        <button
          class="px-3 py-1 rounded-full text-xs transition-all cursor-pointer font-medium
          {selectedCategory === 'general'
            ? 'bg-background text-foreground shadow-2xs border border-border/50'
            : 'text-muted-foreground hover:text-foreground hover:bg-background/40'}"
          onclick={() => (selectedCategory = "general")}
        >
          🏷️ 通用 ({categoryCounts.general})
        </button>
      {/if}
    </div>
  </div>

  <!-- Tag 标签展示区 (小椭圆胶囊 Pill 布局) -->
  <div class="p-5 overflow-y-auto flex-1 space-y-2">
    {#if filteredTags.length === 0}
      <div class="py-16 text-center text-muted-foreground text-xs space-y-1">
        <Tag class="size-6 mx-auto opacity-40 mb-2" />
        <p>未找到匹配的 Tag 标签</p>
      </div>
    {:else}
      <div class="flex flex-wrap gap-2.5">
        {#each filteredTags as tagItem}
          <button
            class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition-all duration-150 cursor-pointer select-none group text-left shadow-2xs hover:scale-102 {getCategoryBadgeClass(
              tagItem.category,
            )}"
            onclick={() => handleCopyTag(tagItem)}
            title="单击复制此 Tag: {tagItem.tag}"
          >
            <!-- 英文 Tag -->
            <span class="font-mono font-medium text-[11px]">{tagItem.tag}</span>

            <!-- 中文对照 -->
            {#if tagItem.zh && tagItem.zh.toLowerCase() !== tagItem.tag.toLowerCase().replace(/_/g, " ")}
              <span class="opacity-30 font-thin">•</span>
              <span class="text-[11px] opacity-90 font-sans font-normal">
                {tagItem.zh}
              </span>
            {/if}

            <!-- 复制状态提示 -->
            {#if copiedTag === tagItem.tag}
              <Check class="size-3 text-emerald-500 ml-1 shrink-0 animate-in fade-in zoom-in-75 duration-150" />
            {:else}
              <Copy class="size-2.5 opacity-0 group-hover:opacity-60 ml-0.5 shrink-0 transition-opacity" />
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- 底部操作按钮栏 (小椭圆按钮) -->
  <div class="px-5 py-3.5 border-t border-border/40 bg-muted/20 flex flex-wrap items-center justify-between gap-3 shrink-0">
    <div class="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        class="h-8 text-xs gap-1.5 rounded-full border-border/60 hover:bg-muted px-3.5 shadow-2xs"
        onclick={handleCopyAllRaw}
      >
        {#if copiedBatchType === "raw"}
          <Check class="size-3.5 text-emerald-500" />
          <span class="text-emerald-500 font-medium">已复制纯英文 Tag！</span>
        {:else}
          <Copy class="size-3.5 text-muted-foreground" />
          <span>复制全部 Tag (纯英文)</span>
        {/if}
      </Button>

      <Button
        variant="outline"
        size="sm"
        class="h-8 text-xs gap-1.5 rounded-full border-border/60 hover:bg-muted px-3.5 shadow-2xs"
        onclick={handleCopyAllWithZh}
      >
        {#if copiedBatchType === "zh"}
          <Check class="size-3.5 text-emerald-500" />
          <span class="text-emerald-500 font-medium">已复制中英对照！</span>
        {:else}
          <Copy class="size-3.5 text-muted-foreground" />
          <span>复制中英对照清单</span>
        {/if}
      </Button>
    </div>

    {#if onclose}
      <Button
        variant="secondary"
        size="sm"
        class="h-8 text-xs font-medium px-5 rounded-full shadow-2xs"
        onclick={onclose}
      >
        关闭
      </Button>
    {/if}
  </div>
</div>

