import { mount, unmount } from "svelte";
import { getAllEditor, openTab, showMessage, type IEventBusMap, type Menu } from "siyuan";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { resolveSiyuanPluginIcon } from "@/libs/plugin-icons";
import { plugin } from "@/utils";
import {
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
        element.classList.add(
          "damophus-theme-root",
          "damophus-question-bank-theme",
          "h-full",
          "overflow-auto",
          "bg-background",
          "text-foreground",
          "p-5",
        );
        const opts = owner.buildOptions();
        const templates = owner.getSetting("templates") || DEFAULT_TEMPLATES;
        const tagPools = owner.getSetting("tagPools") || DEFAULT_TAG_POOLS;
        const siteCredentials = owner.getSetting("siteCredentials") || DEFAULT_SITE_CREDENTIALS;

        const app = mount(MoreBackgroundSettings, {
          target: element,
          props: {
            group: "moreBackground",
            title: owner.t("lets-more-background.displayName" as any),
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
            toolbarPosition: opts.toolbarPosition ?? "belowIcon",
            toolbarCustomX: opts.toolbarCustomX ?? 50,
            toolbarCustomY: opts.toolbarCustomY ?? 15,
            coverBreadcrumb: opts.coverBreadcrumb === true,
            coverDocumentMenu: opts.coverDocumentMenu === true,
            confirmRemoveCover: opts.confirmRemoveCover !== false,
            onMaintenance: (detail) => owner.handleMaintenance(detail),
          },
        });

        element.addEventListener("changed", ((e: CustomEvent) => {
          const detail = e.detail;
          if (detail && detail.key) {
            owner.setSetting(detail.key, detail.value);
            owner.onDataChanged();
          }
        }) as EventListener);

        owner.mountedTabs.set(element, app);
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

  openInTab(): void {
    if (!this.isEntryEnabled("tab")) return;
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

  private readonly handleProtyle = (
    event: CustomEvent<
      | IEventBusMap["loaded-protyle-static"]
      | IEventBusMap["switch-protyle"]
    >,
  ): void => {
    this.controller?.scanRoot(event.detail.protyle.element);
  };

  private readonly handleProtyleDestroyed = (
    event: CustomEvent<IEventBusMap["destroy-protyle"]>,
  ): void => {
    this.controller?.disposeRoot(event.detail.protyle.element);
  };

  override onload(): void {
    void loadTagPoolsFromStorage();
  }

  onDataChanged(): void {
    if (this.layoutReady && this.controller) {
      this.controller.updateOptions(this.buildOptions());
    }
  }

  onLayoutReady(): void {
    this.layoutReady = true;
    this.bindEvents();
    void loadTagPoolsFromStorage().then(() => {
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
      toolbarPosition: this.getSetting("toolbarPosition"),
      toolbarCustomX: Number(this.getSetting("toolbarCustomX")),
      toolbarCustomY: Number(this.getSetting("toolbarCustomY")),
      coverBreadcrumb: this.getSetting("coverBreadcrumb") === true,
      coverDocumentMenu: this.getSetting("coverDocumentMenu") === true,
      confirmRemoveCover: this.getSetting("confirmRemoveCover") !== false,
      autoAddCoverOnEmptyDoc: this.getSetting("autoAddCoverOnEmptyDoc") === true,
      autoRetryOnFailure: this.getSetting("autoRetryOnFailure") !== false,
      deduplicateNewCovers: this.getSetting("deduplicateNewCovers") !== false,
      siteCredentials,
      sources,
      t: (key) => this.t(key as any),
    };
  }
}
