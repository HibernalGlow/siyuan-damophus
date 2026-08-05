import { Dialog, Menu, Plugin } from "siyuan";
import { registerPlugin } from "@frostime/siyuan-plugin-kits";
import { mount, unmount } from "svelte";
import "@/styles/damophus.css";

import SettingPanel from "@/setting.svelte";
import { enableLogging, getLogger } from "@/libs/logger";
import { PluginRegistry } from "@/plugin-registry";
import { settings } from "@/settings";
import { isMobile, setPlugin } from "@/utils";
import damophusToolbarIcon from "../damophus-icon-mono.svg?raw";

const log = getLogger("index");

export default class PluginLetsGo extends Plugin {
  private readonly pluginRegistry = PluginRegistry.getInstance();

  private init(): void {
    const plugin = registerPlugin(this);
    setPlugin(plugin);
    this.pluginRegistry.setMainPlugin(this);
  }

  override async onload(): Promise<void> {
    this.init();
    await settings.load();
    enableLogging(settings.get("debugLogging") || false);
    await this.pluginRegistry.scanPlugins();
    await settings.initData();
    await this.pluginRegistry.initializeEnabledPlugins();
  }

  override async onLayoutReady(): Promise<void> {
    const plugins = this.pluginRegistry.getAllPlugins();
    const hasMenu = plugins.some((plugin) => plugin.enabled && plugin.addMenuItem);

    if (hasMenu) {
      const topBarElement = this.addTopBar({
        icon: damophusToolbarIcon,
        title: "Damophus",
        position: "right",
        callback: () => {
          if (isMobile) {
            this.addMenu();
            return;
          }

          const rect = topBarElement.getBoundingClientRect().width > 0
            ? topBarElement.getBoundingClientRect()
            : document.querySelector<HTMLElement>("#barMore")?.getBoundingClientRect()
              ?? document.querySelector<HTMLElement>("#barPlugins")?.getBoundingClientRect();
          if (rect) this.addMenu(rect);
        },
      });
    }

    for (const plugin of plugins) {
      if (!plugin.enabled || !plugin.onLayoutReady) continue;
      try {
        await plugin.onLayoutReady();
      } catch (error) {
        log.error(`Failed to initialize layout for plugin ${plugin.name}:`, error);
      }
    }
  }

  private addMenu(rect?: DOMRect): void {
    const menu = new Menu("siyuan-damophus-topbar");
    for (const plugin of this.pluginRegistry.getAllPlugins()) {
      if (!plugin.enabled || !plugin.addMenuItem) continue;
      try {
        plugin.addMenuItem(menu);
      } catch (error) {
        log.error(`Failed to add menu item for plugin ${plugin.name}:`, error);
      }
    }

    if (isMobile) {
      menu.fullscreen();
    } else if (rect) {
      menu.open({ x: rect.right, y: rect.bottom, isLeft: true });
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
  }

  openSetting(): void {
    let panel: ReturnType<typeof mount> | undefined;
    const dialog = new Dialog({
      title: "Damophus",
      content: '<div id="damophus-setting-panel" style="height: 600px;"></div>',
      width: "800px",
      destroyCallback: () => {
        if (panel) void unmount(panel);
      },
    });
    const target = dialog.element.querySelector<HTMLElement>("#damophus-setting-panel");
    if (!target) return;
    panel = mount(SettingPanel, { target });
  }
}
