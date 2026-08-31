<script lang="ts">
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import { Switch } from "@/components/ui/switch";

  export let label: (key: string, fallback: string) => string;
  export let width = 1920;
  export let height = 1080;
  export let coverHistoryLimit = 150;
  export let coverSeenLimit = 800;
  export let assetsLocation = "/assets/more-background";
  export let readFromAssets = true;
  export let writeToAssets = false;
  export let directDrag = false;
  export let debugLogging = false;
  export let toolbarPosition: "belowIcon" | "native" | "custom" = "belowIcon";
  export let toolbarCustomX = 50;
  export let toolbarCustomY = 15;
  export let coverBreadcrumb = false;
  export let coverDocumentMenu = false;
  export let confirmRemoveCover = true;
  export let onBasicChange: (key: string, value: unknown) => void;
</script>

<div class="mb-stack">
  <section class="mb-card">
    <div class="mb-card-body">
      <div class="field-grid">
        <div title={label("lets-more-background.widthDescription", "网络随机图源使用的宽度占位符 ({width})。")}>
          <Label class="mb-field-label" for="mb-cover-width">{label("lets-more-background.widthTitle", "图片宽度")}</Label>
          <Input
            id="mb-cover-width"
            type="number"
            value={width}
            oninput={(e) => onBasicChange("width", parseInt((e.target as HTMLInputElement).value, 10) || 1920)}
            class="h-8 bg-background font-mono text-xs"
          />
        </div>
        <div title={label("lets-more-background.heightDescription", "网络随机图源使用的高度占位符 ({height})。")}>
          <Label class="mb-field-label" for="mb-cover-height">{label("lets-more-background.heightTitle", "图片高度")}</Label>
          <Input
            id="mb-cover-height"
            type="number"
            value={height}
            oninput={(e) => onBasicChange("height", parseInt((e.target as HTMLInputElement).value, 10) || 1080)}
            class="h-8 bg-background font-mono text-xs"
          />
        </div>
        <div title={label("lets-more-background.coverHistoryLimitDescription", "最多保留多少条题头图历史。")}>
          <Label class="mb-field-label" for="mb-history-limit">{label("lets-more-background.coverHistoryLimitTitle", "题头图历史上限")}</Label>
          <Input
            id="mb-history-limit"
            type="number"
            min="10"
            max="5000"
            value={coverHistoryLimit}
            oninput={(e) => onBasicChange("coverHistoryLimit", parseInt((e.target as HTMLInputElement).value, 10) || 150)}
            class="h-8 bg-background font-mono text-xs"
          />
        </div>
        <div title={label("lets-more-background.coverSeenLimitDescription", "最多记住多少张已出现过的题头图。")}>
          <Label class="mb-field-label" for="mb-seen-limit">{label("lets-more-background.coverSeenLimitTitle", "去重记忆上限")}</Label>
          <Input
            id="mb-seen-limit"
            type="number"
            min="10"
            max="10000"
            value={coverSeenLimit}
            oninput={(e) => onBasicChange("coverSeenLimit", parseInt((e.target as HTMLInputElement).value, 10) || 800)}
            class="h-8 bg-background font-mono text-xs"
          />
        </div>
      </div>

      <div class="field-block" title={label("lets-more-background.assetsLocationDescription", "题头图读写与画廊使用的资源目录。")}>
        <Label class="mb-field-label" for="mb-assets-location">{label("lets-more-background.assetsLocationTitle", "题头图资源目录")}</Label>
        <Input
          id="mb-assets-location"
          value={assetsLocation}
          oninput={(e) => onBasicChange("assetsLocation", (e.target as HTMLInputElement).value)}
          class="h-8 bg-background font-mono text-xs"
        />
      </div>
    </div>
  </section>

  <!-- 开关项统一压缩为单行列表，说明移入悬停提示 -->
  <section class="mb-card">
    <div class="switch-list">
      <div class="switch-row" title={label("lets-more-background.readFromAssetsDescription", "开启后也会从资源目录中的本地图片随机挑选题头图。")}>
        <span class="switch-title">{label("lets-more-background.readFromAssetsTitle", "从资源目录随机读取")}</span>
        <Switch checked={readFromAssets} onCheckedChange={(value) => onBasicChange("readFromAssets", value)} />
      </div>
      <div class="switch-row" title={label("lets-more-background.writeToAssetsDescription", "将网络题头图下载保存到资源目录，规避防盗链并加速二次加载。")}>
        <span class="switch-title">{label("lets-more-background.writeToAssetsTitle", "保存题头图到资源目录")}</span>
        <Switch checked={writeToAssets} onCheckedChange={(value) => onBasicChange("writeToAssets", value)} />
      </div>
      <div class="switch-row" title={label("lets-more-background.directDragDescription", "在文档题头图上按住即可直接拖拽调整位置。")}>
        <span class="switch-title">{label("lets-more-background.directDragTitle", "题头图直接拖拽调整")}</span>
        <Switch checked={directDrag} onCheckedChange={(value) => onBasicChange("directDrag", value)} />
      </div>
      <div class="switch-row" title={label("lets-more-background.coverBreadcrumbDescription", "在题头图区域显示文档面包屑导航。")}>
        <span class="switch-title">{label("lets-more-background.coverBreadcrumbTitle", "题头图面包屑")}</span>
        <Switch checked={coverBreadcrumb} onCheckedChange={(value) => onBasicChange("coverBreadcrumb", value)} />
      </div>
      <div class="switch-row" title={label("lets-more-background.coverDocumentMenuDescription", "允许题头图出现在锁定、文档与更多控件的上方。")}>
        <span class="switch-title">{label("lets-more-background.coverDocumentMenuTitle", "题头图文档菜单")}</span>
        <Switch checked={coverDocumentMenu} onCheckedChange={(value) => onBasicChange("coverDocumentMenu", value)} />
      </div>
      <div class="switch-row" title={label("lets-more-background.confirmRemoveCoverDescription", "移除文档题头图前显示确认提示，避免误触。")}>
        <span class="switch-title">{label("lets-more-background.confirmRemoveCoverTitle", "移除题头图前确认")}</span>
        <Switch checked={confirmRemoveCover} onCheckedChange={(value) => onBasicChange("confirmRemoveCover", value)} />
      </div>
      <div class="switch-row" title={label("lets-more-background.debugLoggingDescription", "在控制台输出运行日志，便于排查问题。")}>
        <span class="switch-title">{label("lets-more-background.debugLoggingTitle", "调试日志")}</span>
        <Switch checked={debugLogging} onCheckedChange={(value) => onBasicChange("debugLogging", value)} />
      </div>
      <div class="switch-row" title={label("lets-more-background.toolbarPositionDescription", "调整题头图悬浮工具条的出现位置。")}>
        <span class="switch-title">{label("lets-more-background.toolbarPositionTitle", "工具条位置")}</span>
        <select
          class="mb-select"
          value={toolbarPosition}
          onchange={(event) => onBasicChange("toolbarPosition", (event.currentTarget as HTMLSelectElement).value)}
        >
          <option value="belowIcon">{label("lets-more-background.toolbarPositionBelowIcon", "文档图标下方")}</option>
          <option value="native">{label("lets-more-background.toolbarPositionNative", "跟随原生位置")}</option>
          <option value="custom">{label("lets-more-background.toolbarPositionCustom", "自定义坐标")}</option>
        </select>
      </div>
    </div>
  </section>

  {#if toolbarPosition === "custom"}
    <section class="mb-card">
      <div class="mb-card-body">
        <div class="field-grid">
          <label class="slider-field">
            <span class="flex justify-between gap-2">
              <span>{label("lets-more-background.toolbarCustomXTitle", "水平位置")}</span>
              <span class="mb-mono">{toolbarCustomX}%</span>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={toolbarCustomX}
              oninput={(event) => onBasicChange("toolbarCustomX", Number((event.currentTarget as HTMLInputElement).value))}
            />
          </label>
          <label class="slider-field">
            <span class="flex justify-between gap-2">
              <span>{label("lets-more-background.toolbarCustomYTitle", "垂直位置")}</span>
              <span class="mb-mono">{toolbarCustomY}%</span>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={toolbarCustomY}
              oninput={(event) => onBasicChange("toolbarCustomY", Number((event.currentTarget as HTMLInputElement).value))}
            />
          </label>
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  .field-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .field-block {
    padding-top: 12px;
    border-top: 1px solid var(--b3-border-color);
  }

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
    font-size: 12.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .slider-field {
    display: grid;
    gap: 6px;
    font-size: 12px;
  }

  .slider-field input[type="range"] {
    width: 100%;
    accent-color: var(--b3-theme-primary);
  }

  @container mbframe (min-width: 560px) {
    .field-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
  }
</style>
