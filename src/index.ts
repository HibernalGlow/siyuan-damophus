import { Dialog, fetchSyncPost, Menu, Plugin, showMessage } from "siyuan";
import { registerPlugin } from "@frostime/siyuan-plugin-kits";
import { mount, unmount } from "svelte";
import "@/styles/damophus.css";

import SettingPanel from "@/setting.svelte";
import { enableLogging, getLogger } from "@/libs/logger";
import { PluginRegistry } from "@/plugin-registry";
import { settings } from "@/settings";
import { isMobile, setPlugin } from "@/utils";
import damophusMonoIcon from "../damophus-icon-mono.svg?raw";

const log = getLogger("index");
const damophusToolbarIcon = damophusMonoIcon.replace(/^<\?xml[^>]*>\s*/u, "");

export default class PluginLetsGo extends Plugin {
  private readonly pluginRegistry = PluginRegistry.getInstance();
  private topBarElement?: HTMLElement;

  private init(): void {
    const plugin = registerPlugin(this);
    setPlugin(plugin);
    this.pluginRegistry.setMainPlugin(this);
  }

  override async onload(): Promise<void> {
    this.init();
    // Custom tab models must be registered before the first await so SiYuan
    // can restore persisted tabs during startup.
    this.pluginRegistry.scanPlugins();
    this.pluginRegistry.registerModels();
    await settings.load();
    enableLogging(settings.get("debugLogging") || false);
    await settings.initData();
    this.pluginRegistry.refreshEnabledStates();
    await this.pluginRegistry.initializeEnabledPlugins();
  }

  override async onLayoutReady(): Promise<void> {
    this.registerTopBar();
    const plugins = this.pluginRegistry.getAllPlugins();

    for (const plugin of plugins) {
      if (!plugin.enabled || !plugin.onLayoutReady) continue;
      try {
        await plugin.onLayoutReady();
      } catch (error) {
        log.error(`Failed to initialize layout for plugin ${plugin.name}:`, error);
      }
    }
  }

  private registerTopBar(): void {
    if (this.topBarElement) return;
    this.topBarElement = this.addTopBar({
      icon: damophusToolbarIcon,
      title: "Damophus",
      position: "right",
      callback: (event) => {
        if (isMobile) {
          this.addMenu();
          return;
        }
        const target = event.currentTarget instanceof HTMLElement
          ? event.currentTarget
          : this.topBarElement;
        const rect = target?.getBoundingClientRect().width
          ? target.getBoundingClientRect()
          : document.querySelector<HTMLElement>("#barPlugins")?.getBoundingClientRect()
            ?? document.querySelector<HTMLElement>("#barMore")?.getBoundingClientRect();
        if (rect) this.addMenu(rect);
      },
    });
  }

  private addMenu(rect?: DOMRect): void {
    const menu = new Menu("siyuan-damophus-topbar");
    let itemCount = 0;
    for (const plugin of this.pluginRegistry.getAllPlugins()) {
      if (!plugin.enabled || !plugin.addMenuItem) continue;
      try {
        plugin.addMenuItem(menu);
        itemCount += 1;
      } catch (error) {
        log.error(`Failed to add menu item for plugin ${plugin.name}:`, error);
      }
    }
    if (itemCount > 0) menu.addSeparator();
    menu.addItem({
      icon: "iconRefresh",
      label: this.i18n["settings.quickReload"] ?? "Reload Damophus",
      click: () => void this.reloadPlugin(),
    });
    menu.addItem({
      icon: "iconSettings",
      label: this.i18n["settings.preferences"] ?? "设置",
      click: () => this.openSetting(),
    });

    if (isMobile) {
      menu.fullscreen();
    } else if (rect) {
      menu.open({ x: rect.right, y: rect.bottom, isLeft: true });
    }
  }

  private async reloadPlugin(): Promise<void> {
    showMessage(this.i18n["settings.reloading"] ?? "Reloading Damophus...", 2000);
    const response = await fetchSyncPost("/api/petal/setPetalEnabled", {
      packageName: this.name,
      enabled: true,
    });
    if (response.code !== 0) {
      showMessage(
        response.msg || this.i18n["settings.reloadFailed"] || "Failed to reload Damophus",
        5000,
        "error",
      );
    }
  }

  override async onDataChanged(): Promise<void> {
    await this.pluginRegistry.initializeEnabledPlugins();
    await this.pluginRegistry.unloadDisabledPlugins();

    for (const plugin of this.pluginRegistry.getAllPlugins()) {
      if (!plugin.enabled || !plugin.onDataChanged) continue;
      try {
        await plugin.onDataChanged();
      } catch (error) {
        log.error(`Error in onDataChanged for plugin ${plugin.name}:`, error);
      }
    }
  }

  override async onunload(): Promise<void> {
    for (const plugin of this.pluginRegistry.getAllPlugins()) {
      if (!plugin.enabled) continue;
      try {
        await plugin.onunload();
      } catch (error) {
        log.error(`Error in onunload for plugin ${plugin.name}:`, error);
      }
    }
    this.topBarElement = undefined;
  }

  openSetting(): void {
    let panel: ReturnType<typeof mount> | undefined;
    const mobileSetting = isMobile;
    const dialog = new Dialog({
      title: "Damophus",
      content: '<div id="damophus-setting-panel" style="height: 100%; min-height: 0;"></div>',
      width: mobileSetting ? "100vw" : "800px",
      height: mobileSetting ? "100dvh" : undefined,
      destroyCallback: () => {
        if (panel) void unmount(panel);
      },
    });
    const target = dialog.element.querySelector<HTMLElement>("#damophus-setting-panel");
    if (!target) return;
    panel = mount(SettingPanel, { target });
  }
}
