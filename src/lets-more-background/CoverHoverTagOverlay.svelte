<script lang="ts">
  import { onMount } from "svelte";
  import { Check, Copy, ExternalLink, Tag, ChevronRight, X } from "lucide-svelte";
  import { getDetailedTagInfo, type TagDefinition } from "./tag-dictionary";
  import { batchResolveTagsOnline } from "./tag-translation-service";
  import { openCoverTagViewer } from "./tag-viewer";

  export let tags: string[] | string = [];
  export let site: string = "";
  export let postId: string | number = "";
  export let postUrl: string = "";
  export let score: string | number = "";
  export let width: string | number = "";
  export let height: string | number = "";

  let isExpanded = false;
  let copiedTag: string | null = null;
  let refreshVersion = 0;

  $: rawTagList = Array.isArray(tags)
    ? tags
    : typeof tags === "string"
    ? tags.split(/\s+/).filter(Boolean)
    : [];

  $: processedTags = refreshVersion >= 0 ? rawTagList.map((t) => getDetailedTagInfo(t)) : [];

  onMount(() => {
    const hasUntranslated = rawTagList.some((t) => {
      const info = getDetailedTagInfo(t);
      return !info.zh || info.zh.toLowerCase() === t.toLowerCase().replace(/_/g, " ");
    });
    if (hasUntranslated) {
      void batchResolveTagsOnline(rawTagList).then(() => {
        refreshVersion++;
      });
    }
  });

  // 优先级排序：画师 > 原作/IP > 角色 > 场景 > 风格 > 通用
  const categoryPriority: Record<string, number> = {
    artist: 1,
    copyright: 2,
    character: 3,
    scenery: 4,
    style: 5,
    general: 6,
  };

  $: sortedTags = [...processedTags].sort((a, b) => {
    const pa = categoryPriority[a.category || "general"] || 99;
    const pb = categoryPriority[b.category || "general"] || 99;
    return pa - pb;
  });

  $: topTags = sortedTags.slice(0, 5);
  $: remainingCount = Math.max(0, sortedTags.length - topTags.length);

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

  async function handleCopyTag(tagItem: TagDefinition, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await copyText(tagItem.tag);
    copiedTag = tagItem.tag;
    setTimeout(() => {
      if (copiedTag === tagItem.tag) copiedTag = null;
    }, 1500);
  }

  function handleOpenModal(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    openCoverTagViewer({
      site,
      postId,
      postUrl,
      tags: rawTagList,
      score,
      width,
      height,
    });
  }

  function getBadgeClass(cat?: string) {
    switch (cat) {
      case "artist":
        return "bg-amber-500/15 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/35 hover:bg-amber-500/25";
      case "copyright":
        return "bg-purple-500/15 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/35 hover:bg-purple-500/25";
      case "character":
        return "bg-sky-500/15 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/35 hover:bg-sky-500/25";
      case "scenery":
        return "bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/35 hover:bg-emerald-500/25";
      case "style":
        return "bg-pink-500/15 dark:bg-pink-500/20 text-pink-700 dark:text-pink-300 border-pink-500/35 hover:bg-pink-500/25";
      default:
        return "bg-background/80 dark:bg-background/85 text-foreground/85 hover:text-foreground hover:bg-background border-border/60";
    }
  }
</script>

{#if sortedTags.length > 0}
  <!-- 位于操作栏内部的自适应流式排布，与添加标签同排自适应，无重叠 -->
  <div
    role="region"
    aria-label="Cover tags"
    class="damophus-cover-tag-bar inline-flex items-center gap-1.5 flex-wrap select-none my-0.5"
  >
    <!-- 标签图标与计数独立小椭圆 -->
    <button
      type="button"
      class="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/40 shrink-0 cursor-pointer shadow-2xs transition-colors"
      onclick={handleOpenModal}
      title="查看全部 {sortedTags.length} 个标签"
    >
      <Tag class="size-3 text-primary" />
      <span class="font-mono text-[10px] font-medium text-foreground/80">
        {sortedTags.length}
      </span>
    </button>

    <!-- 核心 Tag 独立小椭圆胶囊列表 -->
    {#each (isExpanded ? sortedTags : topTags) as tagItem}
      <button
        type="button"
        class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-all duration-150 cursor-pointer shrink-0 shadow-2xs hover:scale-102 group {getBadgeClass(
          tagItem.category,
        )}"
        onclick={(e) => handleCopyTag(tagItem, e)}
        title="单击复制: {tagItem.tag}"
      >
        <!-- 优先展示中文名称 -->
        <span class="font-medium font-sans">
          {tagItem.zh && tagItem.zh.toLowerCase() !== tagItem.tag.toLowerCase().replace(/_/g, " ")
            ? tagItem.zh
            : tagItem.tag}
        </span>

        {#if copiedTag === tagItem.tag}
          <Check class="size-2.5 text-emerald-500 ml-0.5 shrink-0" />
        {:else}
          <Copy class="size-2 opacity-0 group-hover:opacity-50 ml-0.5 shrink-0 transition-opacity" />
        {/if}
      </button>
    {/each}

    {#if !isExpanded && remainingCount > 0}
      <button
        type="button"
        class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/40 transition-colors cursor-pointer shrink-0 shadow-2xs"
        onclick={() => (isExpanded = true)}
        title="展开剩余 {remainingCount} 个标签"
      >
        <span>+{remainingCount}</span>
        <ChevronRight class="size-2.5" />
      </button>
    {/if}

    <!-- 打开独立详情弹窗按钮 (小椭圆) -->
    <button
      type="button"
      class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 transition-colors cursor-pointer shrink-0 shadow-2xs"
      onclick={handleOpenModal}
      title="打开全量标签弹窗 (包含中英对照、搜索、一键复制全部等)"
    >
      <ExternalLink class="size-2.5" />
      <span>全部</span>
    </button>

    {#if isExpanded}
      <button
        type="button"
        class="size-5 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
        onclick={(e) => {
          e.stopPropagation();
          isExpanded = false;
        }}
        title="收起多余标签"
      >
        <X class="size-3" />
      </button>
    {/if}
  </div>
{/if}

