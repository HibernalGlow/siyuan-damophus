import { mount, unmount } from "svelte";
import { Dialog, getAllEditor, openTab, showMessage, type IEventBusMap, type Menu } from "siyuan";
import { setScopeLogLevel } from "@/libs/logger";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { resolveSiyuanPluginIcon } from "@/libs/plugin-icons";
import { isMobile, plugin } from "@/utils";
import { isolateMobileDialogGestures } from "@/lets-question-bank/mobile-dialog-scroll";
import {
  DEFAULT_COVER_HISTORY_LIMIT,
  DEFAULT_SEEN_COVERS_LIMIT,
  initializeCoverDedupStorage,
  startMoreBackground,
  type MoreBackgroundHandle,
  type MoreBackgroundOptions,
} from "./more-background";
import {
  DEFAULT_COVER_SOURCES,
  DEFAULT_SITE_CREDENTIALS,
  DEFAULT_TAG_POOLS,
  DEFAULT_TEMPLATES,
  templateToUrl,
  type CoverSourceItem,
} from "./sources";
import { resolveBooruImageUrl } from "./booru";
import { getCachedTagPools, loadTagPoolsFromStorage } from "./tag-pool-storage";
import MoreBackgroundSettings from "./MoreBackgroundSettings.svelte";
import { moreBackgroundTabTarget, moreBackgroundTabType } from "./tab-contract";

const icon = resolveSiyuanPluginIcon("images");

export default class MoreBackgroundPlugin extends SubPluginBase {
  private controller?: MoreBackgroundHandle;
  private listening = false;
  private layoutReady = false;
  private tabRegistered = false;
  private readonly mountedTabs = new Map<HTMLElement, ReturnType<typeof mount>>();

  override registerModels(): void {
    if (this.tabRegistered) return;
    this.tabRegistered = true;
    const owner = this;
    plugin.addTab({
      type: moreBackgroundTabType,
      init() {
        const element = this.element as HTMLElement;
        // damophus-mb-tab-host lets the settings surface fill the tab and scroll
        // internally (nav docks to the bottom on narrow panes). Padding is owned
        // by the component so the mobile tab bar can span the full width.
        element.classList.add(
          "damophus-theme-root",
          "damophus-question-bank-theme",
          "damophus-mb-tab-host",
          "h-full",
          "overflow-hidden",
          "bg-background",
          "text-foreground",
        );
        owner.mountSettingsSurface(element);
      },
      destroy() {
        const element = this.element as HTMLElement;
        const app = owner.mountedTabs.get(element);
        if (app) void unmount(app);
        owner.mountedTabs.delete(element);
      },
    });
  }

  addMenuItem(menu: Menu): void {
    if (!this.isEntryEnabled("menu") || !this.isEntryEnabled("tab")) return;
    menu.addItem({
      icon,
      label: this.t("lets-more-background.menuOpen" as any),
      click: () => this.openInTab(),
    });
  }

  /** Tab 和移动端 Dialog 共用的挂载入口：负责 props 组装与 changed 事件回写。 */
  private mountSettingsSurface(target: HTMLElement): ReturnType<typeof mount> {
    const opts = this.buildOptions();
    const templates = this.getSetting("templates") || DEFAULT_TEMPLATES;
    const tagPools = this.getSetting("tagPools") || DEFAULT_TAG_POOLS;
    const siteCredentials = this.getSetting("siteCredentials") || DEFAULT_SITE_CREDENTIALS;

    const app = mount(MoreBackgroundSettings, {
      target,
      props: {
        group: "moreBackground",
        title: this.t("lets-more-background.displayName" as any),
        templates,
        tagPools,
        siteCredentials,
        width: opts.width,
        height: opts.height,
        assetsLocation: opts.assetsLocation,
        readFromAssets: opts.readFromAssets,
        writeToAssets: opts.writeToAssets,
        localCache: opts.localCache,
        autoCacheLegacyCovers: opts.autoCacheLegacyCovers,
        purgeCacheOnCoverChange: opts.purgeCacheOnCoverChange === true,
        localCacheRoot: opts.localCacheRoot,
        localCachePathTemplate: opts.localCachePathTemplate,
        localCacheMaxEdge: opts.localCacheMaxEdge,
        directDrag: opts.directDrag === true,
        debugLogging: opts.debugLogging === true,
        toolbarPosition: opts.toolbarPosition ?? "belowIcon",
        toolbarCustomX: opts.toolbarCustomX ?? 50,
        toolbarCustomY: opts.toolbarCustomY ?? 15,
        coverBreadcrumb: opts.coverBreadcrumb === true,
        coverDocumentMenu: opts.coverDocumentMenu === true,
        confirmRemoveCover: opts.confirmRemoveCover !== false,
        coverHistoryLimit: opts.coverHistoryLimit ?? DEFAULT_COVER_HISTORY_LIMIT,
        coverSeenLimit: opts.coverSeenLimit ?? DEFAULT_SEEN_COVERS_LIMIT,
        onMaintenance: (detail) => this.handleMaintenance(detail),
      },
    });

    target.addEventListener("changed", ((e: CustomEvent) => {
      const detail = e.detail;
      if (detail && detail.key) {
        this.setSetting(detail.key, detail.value);
        this.onDataChanged();
      }
    }) as EventListener);

    this.mountedTabs.set(target, app);
    return app;
  }

  openInTab(): void {
    if (!this.isEntryEnabled("tab")) return;
    if (isMobile) {
      // 移动端没有自定义页签容器，参照题库工作台改为全屏 Dialog 承载。
      let app: ReturnType<typeof mount> | undefined;
      let removeGestureIsolation: (() => void) | undefined;
      const dialog = new Dialog({
        title: this.t("lets-more-background.displayName" as any),
        content: '<div class="damophus-more-background-dialog damophus-mb-tab-host h-full min-h-0 overflow-hidden"></div>',
        width: "94vw",
        height: "calc(100dvh - 24px)",
        destroyCallback: () => {
          removeGestureIsolation?.();
          const target = dialog.element.querySelector<HTMLElement>(".damophus-more-background-dialog");
          const mounted = target ? this.mountedTabs.get(target) : undefined;
          if (mounted) void unmount(mounted);
          if (target) this.mountedTabs.delete(target);
        },
      });
      dialog.element.classList.add("damophus-more-background-mobile-dialog", "damophus-theme-root", "damophus-question-bank-theme");
      removeGestureIsolation = isolateMobileDialogGestures(dialog.element);
      const target = dialog.element.querySelector<HTMLElement>(".damophus-more-background-dialog");
      if (!target) return;
      app = this.mountSettingsSurface(target);
      void app;
      return;
    }
    void openTab({
      app: plugin.app,
      custom: {
        icon,
        title: this.t("lets-more-background.displayName" as any),
        ...moreBackgroundTabTarget(plugin.name),
      },
    });
  }

  async testConnection(): Promise<void> {
    const opts = this.buildOptions();
    const testUrl =
      opts.sources.find((s) => s.url?.startsWith("booru:"))?.url ||
      "booru:sb?tags=wallpaper&rating=safe";
    try {
      const result = await resolveBooruImageUrl(testUrl, opts.siteCredentials);
      if (result) {
        showMessage(`${this.t("lets-more-background.testConnectionSuccess" as any)}\n${result}`);
      } else {
        showMessage(this.t("lets-more-background.testConnectionFailed" as any));
      }
    } catch {
      showMessage(this.t("lets-more-background.testConnectionFailed" as any));
    }
  }

  async handleMaintenance(detail: { action: "maintain" | "cleanup"; documentLink?: string }): Promise<void> {
    try {
      if (detail.action === "cleanup") {
        const result = await this.controller?.cleanupLocalCache();
        showMessage(this.t("lets-more-background.cacheCleanupSuccess" as any).replace("{count}", String(result?.removed ?? 0)));
        return;
      }
      const result = await this.controller?.maintainLocalCache(detail.documentLink || "");
      showMessage(this.t("lets-more-background.cacheMaintenanceSuccess" as any)
        .replace("{cached}", String(result?.cached ?? 0))
        .replace("{skipped}", String(result?.skipped ?? 0))
        .replace("{failed}", String(result?.failed ?? 0)));
    } catch (error) {
      showMessage(`${this.t("lets-more-background.cacheMaintenanceFailed" as any)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // SiYuan fires loaded-protyle-static and switch-protyle back to back on every
  // tab switch; a full scanRoot re-init per event doubles the attr fetches. Skip
  // rescans of a still-connected root within this window.
  private static readonly SCAN_TTL_MS = 1200;
  private readonly scanTimestamps = new WeakMap<HTMLElement, number>();

  private readonly handleProtyle = (
    event: CustomEvent<
      | IEventBusMap["loaded-protyle-static"]
      | IEventBusMap["switch-protyle"]
    >,
  ): void => {
    const root = event.detail.protyle.element;
    const lastScanAt = this.scanTimestamps.get(root);
    const now = Date.now();
    if (lastScanAt && now - lastScanAt < MoreBackgroundPlugin.SCAN_TTL_MS && root.isConnected) return;
    this.scanTimestamps.set(root, now);
    this.controller?.scanRoot(root);
  };

  private readonly handleProtyleDestroyed = (
    event: CustomEvent<IEventBusMap["destroy-protyle"]>,
  ): void => {
    this.controller?.disposeRoot(event.detail.protyle.element);
  };

  override onload(): void {
    this.syncLogging();
    void loadTagPoolsFromStorage();
  }

  onDataChanged(): void {
    this.syncLogging();
    if (this.layoutReady && this.controller) {
      this.controller.updateOptions(this.buildOptions());
    }
  }

  private syncLogging(): void {
    setScopeLogLevel("lets-more-background", this.getSetting("debugLogging") === true ? "debug" : undefined);
  }

  onLayoutReady(): void {
    this.layoutReady = true;
    this.bindEvents();
    void Promise.all([loadTagPoolsFromStorage(), initializeCoverDedupStorage()]).then(() => {
      this.startController();
    });
  }

  override onunload(): void {
    for (const app of this.mountedTabs.values()) void unmount(app);
    this.mountedTabs.clear();
    this.unbindEvents();
    this.controller?.dispose();
    this.controller = undefined;
    this.layoutReady = false;
  }

  private bindEvents(): void {
    if (this.listening) return;
    this.listening = true;
    plugin.eventBus.on("loaded-protyle-static", this.handleProtyle);
    plugin.eventBus.on("switch-protyle", this.handleProtyle);
    plugin.eventBus.on("destroy-protyle", this.handleProtyleDestroyed);
  }

  private unbindEvents(): void {
    if (!this.listening) return;
    this.listening = false;
    plugin.eventBus.off("loaded-protyle-static", this.handleProtyle);
    plugin.eventBus.off("switch-protyle", this.handleProtyle);
    plugin.eventBus.off("destroy-protyle", this.handleProtyleDestroyed);
  }

  private startController(): void {
    this.controller?.dispose();
    const options = this.buildOptions();
    this.controller = startMoreBackground(options);
    for (const editor of getAllEditor()) {
      if (editor.protyle?.element) {
        this.controller.scanRoot(editor.protyle.element);
      }
    }
  }

  private buildOptions(): MoreBackgroundOptions {
    const rawTemplates = this.getSetting("templates");
    const tagPools = getCachedTagPools();
    let sources: CoverSourceItem[] = [];

    if (Array.isArray(rawTemplates) && rawTemplates.length > 0) {
      sources = rawTemplates.map((tpl) => ({
        label: tpl.name || "Template",
        url: templateToUrl(tpl, tagPools),
      }));
    } else {
      const rawSources = this.getSetting("sources");
      sources =
        Array.isArray(rawSources) && rawSources.length > 0
          ? rawSources
          : DEFAULT_COVER_SOURCES;
    }

    const siteCredentials = this.getSetting("siteCredentials") || DEFAULT_SITE_CREDENTIALS;

    return {
      width: Number(this.getSetting("width")) || 1920,
      height: Number(this.getSetting("height")) || 1080,
      assetsLocation: (this.getSetting("assetsLocation") || "/assets/more-background").toString(),
      readFromAssets: this.getSetting("readFromAssets") !== false,
      writeToAssets: this.getSetting("writeToAssets") === true,
      localCache: this.getSetting("localCache") === true,
      autoCacheLegacyCovers: this.getSetting("autoCacheLegacyCovers") === true,
      purgeCacheOnCoverChange: this.getSetting("purgeCacheOnCoverChange") === true,
      localCacheRoot: (this.getSetting("localCacheRoot") || "/storage/petal/siyuan-damophus/more-background/covers").toString(),
      localCachePathTemplate: (this.getSetting("localCachePathTemplate") || "{year}/{month}/{hash}.webp").toString(),
      localCacheMaxEdge: this.getSetting("localCacheMaxEdge") || "1920",
      directDrag: this.getSetting("directDrag") === true,
      debugLogging: this.getSetting("debugLogging") === true,
      toolbarPosition: this.getSetting("toolbarPosition"),
      toolbarCustomX: Number(this.getSetting("toolbarCustomX")),
      toolbarCustomY: Number(this.getSetting("toolbarCustomY")),
      coverBreadcrumb: this.getSetting("coverBreadcrumb") === true,
      coverDocumentMenu: this.getSetting("coverDocumentMenu") === true,
      confirmRemoveCover: this.getSetting("confirmRemoveCover") !== false,
      autoAddCoverOnEmptyDoc: this.getSetting("autoAddCoverOnEmptyDoc") === true,
      autoRetryOnFailure: this.getSetting("autoRetryOnFailure") !== false,
      deduplicateNewCovers: this.getSetting("deduplicateNewCovers") !== false,
      coverHistoryLimit: Number(this.getSetting("coverHistoryLimit")) || DEFAULT_COVER_HISTORY_LIMIT,
      coverSeenLimit: Number(this.getSetting("coverSeenLimit")) || DEFAULT_SEEN_COVERS_LIMIT,
      siteCredentials,
      sources,
      t: (key) => this.t(key as any),
    };
  }
}
