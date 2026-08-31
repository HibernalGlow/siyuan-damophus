<script lang="ts">
  import { RefreshCw, Trash2 } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import { Switch } from "@/components/ui/switch";

  export let label: (key: string, fallback: string) => string;
  export let localCache = false;
  export let autoCacheLegacyCovers = false;
  export let purgeCacheOnCoverChange = false;
  export let localCacheRoot = "/storage/petal/siyuan-damophus/more-background/covers";
  export let localCachePathTemplate = "{year}/{month}/{hash}.webp";
  export let localCacheMaxEdge: "none" | "1280" | "1920" | "2560" = "1920";
  export let onBasicChange: (key: string, value: unknown) => void;
  export let onMaintenance: (detail: { action: "maintain" | "cleanup"; documentLink?: string }) => void | Promise<void>;

  let maintenanceDocumentLink = "";
  let maintenanceBusy = false;
  let cleanupBusy = false;
</script>

<div class="mb-stack">
  <section class="mb-card">
    <div class="switch-list">
      <div class="switch-row" title={label("lets-more-background.localCacheDescription", "将网络题头图缓存到本地磁盘，二次加载更快且不受图站波动影响。")}>
        <span class="switch-title">{label("lets-more-background.localCacheTitle", "本地缓存")}</span>
        <Switch checked={localCache} onCheckedChange={(value) => onBasicChange("localCache", value)} />
      </div>

      <div class="cache-detail" class:disabled={!localCache}>
        <div class="switch-row" title={label("lets-more-background.autoCacheLegacyCoversDescription", "将历史遗留的题头图自动纳入本地缓存。")}>
          <span class="switch-title">{label("lets-more-background.autoCacheLegacyCoversTitle", "自动缓存旧题头图")}</span>
          <Switch disabled={!localCache} checked={autoCacheLegacyCovers} onCheckedChange={(value) => onBasicChange("autoCacheLegacyCovers", value)} />
        </div>

        <div class="switch-row" title={label("lets-more-background.purgeCacheOnCoverChangeDescription", "文档更换题头图后自动清理不再使用的缓存文件。")}>
          <span class="switch-title">{label("lets-more-background.purgeCacheOnCoverChangeTitle", "换图时清理旧缓存")}</span>
          <Switch disabled={!localCache} checked={purgeCacheOnCoverChange} onCheckedChange={(value) => onBasicChange("purgeCacheOnCoverChange", value)} />
        </div>

        <div class="switch-row" title={label("lets-more-background.localCacheRootDescription", "缓存文件存放的根目录。")}>
          <span class="switch-title">{label("lets-more-background.localCacheRootTitle", "缓存根目录")}</span>
          <Input
            id="mb-cache-root"
            disabled={!localCache}
            value={localCacheRoot}
            oninput={(e) => onBasicChange("localCacheRoot", (e.target as HTMLInputElement).value)}
            class="h-8 min-w-0 flex-1 bg-background font-mono text-xs sm:max-w-[260px]"
          />
        </div>

        <div class="switch-row" title={label("lets-more-background.localCachePathTemplateDescription", "支持 {year} {month} {hash} 占位符。")}>
          <span class="switch-title">{label("lets-more-background.localCachePathTemplateTitle", "缓存路径模板")}</span>
          <Input
            id="mb-cache-template"
            disabled={!localCache}
            value={localCachePathTemplate}
            oninput={(e) => onBasicChange("localCachePathTemplate", (e.target as HTMLInputElement).value)}
            class="h-8 min-w-0 flex-1 bg-background font-mono text-xs sm:max-w-[220px]"
          />
        </div>

        <div class="switch-row" title={label("lets-more-background.localCacheMaxEdgeDescription", "超过限制的图片会等比缩小后缓存，节省磁盘空间。")}>
          <span class="switch-title">{label("lets-more-background.localCacheMaxEdgeTitle", "最长边限制")}</span>
          <select
            id="mb-cache-edge"
            class="mb-select"
            disabled={!localCache}
            value={localCacheMaxEdge}
            onchange={(event) => onBasicChange("localCacheMaxEdge", (event.currentTarget as HTMLSelectElement).value)}
          >
            <option value="none">{label("lets-more-background.localCacheMaxEdgeOriginal", "原图尺寸")}</option>
            <option value="1280">{label("lets-more-background.localCacheMaxEdge1280", "1280 px")}</option>
            <option value="1920">{label("lets-more-background.localCacheMaxEdge1920", "1920 px")}</option>
            <option value="2560">{label("lets-more-background.localCacheMaxEdge2560", "2560 px")}</option>
          </select>
        </div>
      </div>
    </div>
  </section>

  <section class="mb-card">
    <div class="mb-card-body">
      <div title={label("lets-more-background.cacheMaintenanceDescription", "对单个文档执行缓存重建，或清理全部孤立缓存文件。")}>
        <Label class="mb-field-label" for="mb-cache-maintain">{label("lets-more-background.cacheMaintenanceTitle", "缓存维护")}</Label>
        <Input
          id="mb-cache-maintain"
          bind:value={maintenanceDocumentLink}
          placeholder={label("lets-more-background.cacheMaintenancePlaceholder", "粘贴文档链接或 ID")}
          class="h-8 bg-background font-mono text-xs"
        />
      </div>
      <div class="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          class="gap-1.5"
          disabled={!localCache || maintenanceBusy || !maintenanceDocumentLink.trim()}
          onclick={async () => {
            maintenanceBusy = true;
            try {
              await onMaintenance({ action: "maintain", documentLink: maintenanceDocumentLink.trim() });
            } finally {
              maintenanceBusy = false;
            }
          }}
        >
          <RefreshCw class="size-3.5" />
          <span>{label("lets-more-background.cacheMaintenanceButton", "重建该文档缓存")}</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="gap-1.5"
          disabled={!localCache || cleanupBusy}
          onclick={async () => {
            cleanupBusy = true;
            try {
              await onMaintenance({ action: "cleanup" });
            } finally {
              cleanupBusy = false;
            }
          }}
        >
          <Trash2 class="size-3.5" />
          <span>{label("lets-more-background.cacheCleanupButton", "清理孤立缓存")}</span>
        </Button>
      </div>
    </div>
  </section>
</div>

<style>
  .switch-list {
    padding: 3px 14px;
  }

  .switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 38px;
    padding: 3px 0;
  }

  .switch-row + .switch-row {
    border-top: 1px solid color-mix(in srgb, var(--b3-border-color) 55%, transparent);
  }

  .switch-title {
    min-width: 0;
    overflow: hidden;
    flex: 0 0 auto;
    font-size: 12.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cache-detail {
    display: grid;
    gap: 0;
    border-top: 1px solid var(--b3-border-color);
    transition: opacity 150ms ease;
  }

  .cache-detail.disabled {
    opacity: 0.55;
  }

  .mb-select {
    flex: 0 0 auto;
    width: auto;
    max-width: 150px;
    min-height: 30px;
    padding: 4px 8px;
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-background);
    font-size: 12px;
  }
</style>
