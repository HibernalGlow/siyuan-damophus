<script lang="ts">
  import { onMount } from "svelte";
  import { Check, Copy, ExternalLink, Sparkles, Tag, ChevronRight, X } from "lucide-svelte";
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
        return "bg-amber-500/25 text-amber-200 border-amber-400/40 hover:bg-amber-500/35";
      case "copyright":
        return "bg-purple-500/25 text-purple-200 border-purple-400/40 hover:bg-purple-500/35";
      case "character":
        return "bg-sky-500/25 text-sky-200 border-sky-400/40 hover:bg-sky-500/35";
      case "scenery":
        return "bg-emerald-500/25 text-emerald-200 border-emerald-400/40 hover:bg-emerald-500/35";
      case "style":
        return "bg-pink-500/25 text-pink-200 border-pink-400/40 hover:bg-pink-500/35";
      default:
        return "bg-white/10 text-white/90 border-white/20 hover:bg-white/20";
    }
  }
</script>

{#if sortedTags.length > 0}
  <!-- 浮动在题头图左上方，仅当题头图 hover 时显示，移出或下滑自动隐藏，不遮挡下方标题与图标 -->
  <div
    role="region"
    aria-label="Cover tags overlay"
    class="damophus-cover-hover-tag-bar absolute top-3.5 left-4 z-20 pointer-events-none opacity-0 transition-all duration-200 ease-out select-none transform -translate-y-1"
  >
    <div
      class="pointer-events-auto flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-lg backdrop-blur-md bg-black/60 dark:bg-black/70 text-white/95 border border-white/15 shadow-xl max-w-[min(88vw,700px)]"
    >
      <!-- 标签图标与计数 -->
      <button
        type="button"
        class="flex items-center gap-1 text-[11px] font-medium text-white/70 px-1 shrink-0 cursor-pointer hover:text-white transition-colors bg-transparent border-0"
        onclick={handleOpenModal}
        title="查看全部 {sortedTags.length} 个标签"
      >
        <Tag class="size-3 text-primary" />
        <span class="font-mono text-[10px] bg-white/15 px-1.5 py-0.2 rounded-full text-white/90 font-medium">
          {sortedTags.length}
        </span>
      </button>

      <!-- 核心 Tag 胶囊列表 -->
      {#each (isExpanded ? sortedTags : topTags) as tagItem}
        <button
          type="button"
          class="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border transition-all cursor-pointer group shadow-2xs {getBadgeClass(
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
            <Check class="size-2.5 text-emerald-400 ml-0.5 shrink-0" />
          {:else}
            <Copy class="size-2 opacity-0 group-hover:opacity-60 ml-0.5 shrink-0 transition-opacity" />
          {/if}
        </button>
      {/each}

      {#if !isExpanded && remainingCount > 0}
        <button
          type="button"
          class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] bg-white/15 text-white/90 hover:bg-white/25 border border-white/20 transition-colors cursor-pointer font-medium"
          onclick={() => (isExpanded = true)}
          title="展开剩余 {remainingCount} 个标签"
        >
          <span>+{remainingCount}</span>
          <ChevronRight class="size-2.5" />
        </button>
      {/if}

      <!-- 打开独立详情弹窗按钮 -->
      <button
        type="button"
        class="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] bg-white/10 hover:bg-white/20 text-white/90 border border-white/15 transition-colors cursor-pointer font-medium ml-1"
        onclick={handleOpenModal}
        title="打开全量标签弹窗 (包含搜索、复制全部等)"
      >
        <ExternalLink class="size-2.5" />
        <span>全部</span>
      </button>

      {#if isExpanded}
        <button
          type="button"
          class="p-0.5 rounded-md text-white/60 hover:text-white hover:bg-white/20 transition-colors cursor-pointer ml-0.5"
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
  </div>
{/if}

<style>
  :global(.protyle-background:hover .damophus-cover-hover-tag-bar),
  :global(.protyle-top:hover .damophus-cover-hover-tag-bar) {
    opacity: 1 !important;
    pointer-events: auto !important;
    transform: translateY(0) !important;
  }
</style>
