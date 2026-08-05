import "./lets-block-attr/style/index.css";
import "./custom-css/index.css";

import { Dialog, Menu, Plugin } from "siyuan";
import SettingPannel from "@/setting.svelte";
import { settings } from "./settings";
import { isMobile, setPlugin } from "./utils";
import { registerPlugin } from "@frostime/siyuan-plugin-kits";
import { PluginRegistry } from "./plugin-registry";
import { enableLogging, getLogger } from "./libs/logger";
import { clearSqlCache } from "@/api";
import damophusToolbarIcon from "../damophus-icon-mono.svg?raw";
const log = getLogger("index");

export default class PluginLetsGo extends Plugin {
  private pluginRegistry = PluginRegistry.getInstance();

  // Sub-plugins are managed by PluginRegistry

  codeSnippets = [];
  //获取插件类实例
  init() {
    const plugin = registerPlugin(this);
    setPlugin(plugin);
    this.pluginRegistry.setMainPlugin(this);
  }

  _name = "siyuan-damophus";

  // Delegate events to enabled plugins through registry
  private delegateEvent(eventName: string, eventData: any) {
    const plugins = this.pluginRegistry.getAllPlugins();
    for (const plugin of plugins) {
      if (plugin.enabled && plugin[eventName]) {
        try {
          plugin[eventName](eventData);
        } catch (error) {
          log.error(`Error in ${eventName} for plugin ${plugin.name}:`, error);
        }
      }
    }
  }

  //绑定文档块右键菜单
  editortitleiconEvent(eventData: any) {
    this.delegateEvent("editortitleiconEvent", eventData);
  }

  mobilekeyboardshowEvent(eventData: any) {
    this.delegateEvent("mobilekeyboardshowEvent", eventData);
  }

  mobilekeyboardhideEvent(eventData: any) {
    this.delegateEvent("mobilekeyboardhideEvent", eventData);
  }

  //编辑器切换事件
  switchProtyleEvent(eventData: any) {
    this.delegateEvent("switchProtyleEvent", eventData);
  }

  openSiyuanUrlPluginEvent(eventData: any) {
    this.delegateEvent("openSiyuanUrlPluginEvent", eventData);
  }

  //块右键菜单
  private blockIconEvent(eventData: any) {
    this.delegateEvent("blockIconEvent", eventData);
  }

  //App 准备好时加载
  public async onLayoutReady() {
    log.info("onLayoutReady");
    const plugins = this.pluginRegistry.getAllPlugins();
    log.info("plugins", plugins);
    // 默认添加 topBar，方便实时加载
    let needAddTopBar = false;
    for (const plugin of plugins) {
      if (plugin.enabled && plugin.addMenuItem) {
        needAddTopBar = true;
        break;
      }
    }

    if (needAddTopBar) {
      const topBarElement = this.addTopBar({
        icon: damophusToolbarIcon,
        title: "Damophus",
        position: "right",
        callback: () => {
          if (isMobile) {
            this.addMenu();
          } else {
            let rect = topBarElement.getBoundingClientRect();
            // 如果被隐藏，则使用更多按钮
            if (rect.width === 0) {
              rect = document.querySelector("#barMore").getBoundingClientRect();
            }
            if (rect.width === 0) {
              rect = document
                .querySelector("#barPlugins")
                .getBoundingClientRect();
            }
            //log.info("rect", rect);
            this.addMenu(rect);
          }
        },
      });
    }

    // Call onLayoutReady for enabled plugins
    // //log.info("onLayoutReady");

    // //log.info("onLayoutReady", plugins);
    for (const plugin of plugins) {
      if (plugin.enabled && plugin.onLayoutReady) {
        // //log.info("onLayoutReady", plugin.name);
        try {
          await plugin.onLayoutReady();
        } catch (error) {
          log.error(
            `Failed to call onLayoutReady for plugin ${plugin.name}:`,
            error,
          );
        }
      }
    }

    this.eventBus.on("loaded-protyle-static", (event) => {
      // Delegate to plugins that handle protyle events
      this.delegateEvent("onProtyleLoaded", event);
    });
  }

  addMenu(rect?: DOMRect) {
    const menu = new Menu("siyuan-damophus-topbar");
    const plugins = this.pluginRegistry.getAllPlugins();
    for (const plugin of plugins) {
      if (plugin.enabled && plugin.addMenuItem) {
        try {
          plugin.addMenuItem(menu);
        } catch (error) {
          log.error(
            `Failed to call onLayoutReady for plugin ${plugin.name}:`,
            error,
          );
        }
      }
    }
    if (isMobile) {
      menu.fullscreen();
    } else {
      menu.open({
        x: rect.right,
        y: rect.bottom,
        isLeft: true,
      });
    }
  }
  // 在边栏上注入的图标在onLayoutReady执行；为了避免同步插件配置改变后会执行 unload 逻辑，因此 load 需要再执行一下。
  showMoreIconsOnBar() {
    // This method is now handled by individual plugins in their onload methods
    // Legacy plugins that haven't been migrated yet would need to be handled here
    // For now, this is a placeholder for backward compatibility
  }
  public static readonly INLINE_TYPE: string[] = [
    "block-ref",
    "kbd",
    "text",
    "file-annotation-ref",
    "a",
    "strong",
    "em",
    "u",
    "s",
    "mark",
    "sup",
    "sub",
    "tag",
    "code",
    "inline-math",
    "inline-memo",
    "clear",
  ];

  //App 启动时加载
  public async onload() {
    log.info("PluginLetsGo onload");
    this.init();

    //log.info("onload");
    //载入配置
    await settings.load();
    // 恢复上次 debugLogging 状态
    enableLogging(settings.get("debugLogging") || false);

    //log.info("initData", plugin.data);

    // Scan and load all plugins
    await this.pluginRegistry.scanPlugins();

    await settings.initData();

    // Initialize enabled plugins
    await this.pluginRegistry.initializeEnabledPlugins();

    this.addIcons(`<symbol id="iconFace" viewBox="0 0 32 32">
<path d="M13.667 17.333c0 0.92-0.747 1.667-1.667 1.667s-1.667-0.747-1.667-1.667 0.747-1.667 1.667-1.667 1.667 0.747 1.667 1.667zM20 15.667c-0.92 0-1.667 0.747-1.667 1.667s0.747 1.667 1.667 1.667 1.667-0.747 1.667-1.667-0.747-1.667-1.667-1.667zM29.333 16c0 7.36-5.973 13.333-13.333 13.333s-13.333-5.973-13.333-13.333 5.973-13.333 13.333-13.333 13.333 5.973 13.333 13.333zM14.213 5.493c1.867 3.093 5.253 5.173 9.12 5.173 0.613 0 1.213-0.067 1.787-0.16-1.867-3.093-5.253-5.173-9.12-5.173-0.613 0-1.213 0.067-1.787 0.16zM5.893 12.627c2.28-1.293 4.040-3.4 4.88-5.92-2.28 1.293-4.040 3.4-4.88 5.92zM26.667 16c0-1.040-0.16-2.040-0.44-2.987-0.933 0.2-1.893 0.32-2.893 0.32-4.173 0-7.893-1.92-10.347-4.92-1.4 3.413-4.187 6.093-7.653 7.4 0.013 0.053 0 0.12 0 0.187 0 5.88 4.787 10.667 10.667 10.667s10.667-4.787 10.667-10.667z"></path>
</symbol>
<symbol id="iconSaving" viewBox="0 0 32 32">
<path d="M20 13.333c0-0.733 0.6-1.333 1.333-1.333s1.333 0.6 1.333 1.333c0 0.733-0.6 1.333-1.333 1.333s-1.333-0.6-1.333-1.333zM10.667 12h6.667v-2.667h-6.667v2.667zM29.333 10v9.293l-3.76 1.253-2.24 7.453h-7.333v-2.667h-2.667v2.667h-7.333c0 0-3.333-11.28-3.333-15.333s3.28-7.333 7.333-7.333h6.667c1.213-1.613 3.147-2.667 5.333-2.667 1.107 0 2 0.893 2 2 0 0.28-0.053 0.533-0.16 0.773-0.187 0.453-0.347 0.973-0.427 1.533l3.027 3.027h2.893zM26.667 12.667h-1.333l-4.667-4.667c0-0.867 0.12-1.72 0.347-2.547-1.293 0.333-2.347 1.293-2.787 2.547h-8.227c-2.573 0-4.667 2.093-4.667 4.667 0 2.507 1.627 8.867 2.68 12.667h2.653v-2.667h8v2.667h2.68l2.067-6.867 3.253-1.093v-4.707z"></path>
</symbol>`);

    // Bind global events that plugins may need
    this.eventBus.on("click-blockicon", (event) => this.blockIconEvent(event));
    this.eventBus.on("switch-protyle", (event) =>
      this.switchProtyleEvent(event),
    );
    this.eventBus.on("click-editortitleicon", (event) =>
      this.editortitleiconEvent(event),
    );
    this.eventBus.on("mobile-keyboard-show", (event) =>
      this.mobilekeyboardshowEvent(event),
    );
    this.eventBus.on("mobile-keyboard-hide", (event) =>
      this.mobilekeyboardhideEvent(event),
    );
    this.eventBus.on("open-siyuan-url-plugin", (event) =>
      this.openSiyuanUrlPluginEvent(event),
    );
    this.eventBus.on("ws-main", (event) => {
      // 当发生文档交易（比如用户修改了块内容）时，清理全局 SQL 缓存，保证查询面板数据实时
      if (event.detail?.cmd === "transactions") {
        clearSqlCache();
      }
    });

    // OCR 图片右键菜单事件 - delegate to plugins
    this.eventBus.on("open-menu-image", (event) => this.imageMenuEvent(event));

    // https://github.com/siyuan-note/siyuan/blob/fe4523fff2c84d6b06856331e735cc2938c2c5b0/app/src/plugin/index.ts#L93
    // 应该是构造时有异步加载的问题，不能正常给 toolbar 添加快捷键。所以需要手动在onload时再加载一遍
    this.updateProtyleToolbar([]).forEach((toolbarItem) => {
      if (
        typeof toolbarItem === "string" ||
        PluginLetsGo.INLINE_TYPE.concat("|").includes(toolbarItem.name)
      ) {
        return;
      }
      if (typeof toolbarItem.hotkey !== "string") {
        toolbarItem.hotkey = "";
      }
      if (!window.siyuan.config.keymap.plugin) {
        window.siyuan.config.keymap.plugin = {};
      }
      if (!window.siyuan.config.keymap.plugin[this._name]) {
        window.siyuan.config.keymap.plugin[this._name] = {
          [toolbarItem.name]: {
            default: toolbarItem.hotkey,
            custom: toolbarItem.hotkey,
          },
        };
      }
      if (!window.siyuan.config.keymap.plugin[this._name][toolbarItem.name]) {
        window.siyuan.config.keymap.plugin[this._name][toolbarItem.name] = {
          default: toolbarItem.hotkey,
          custom: toolbarItem.hotkey,
        };
      } else {
        window.siyuan.config.keymap.plugin[this._name][
          toolbarItem.name
        ].default = toolbarItem.hotkey;
      }
    });
  }

  async onDataChanged() {
    //log.info("onDataChanged");

    // Handle plugin enable/disable changes
    await this.pluginRegistry.initializeEnabledPlugins();
    await this.pluginRegistry.unloadDisabledPlugins();

    // Call onDataChanged for enabled plugins
    const plugins = this.pluginRegistry.getAllPlugins();
    for (const plugin of plugins) {
      if (plugin.enabled && plugin.onDataChanged) {
        try {
          await plugin.onDataChanged();
        } catch (error) {
          log.error(`Error in onDataChanged for plugin ${plugin.name}:`, error);
        }
      }
    }
  }

  // 卸载逻辑
  async onunload() {
    // Call onunload for all enabled sub-plugins
    const plugins = this.pluginRegistry.getAllPlugins();
    for (const plugin of plugins) {
      try {
        if (plugin.enabled) {
          await plugin.onunload();
        }
      } catch (error) {
        log.error(`Error in onunload for plugin ${plugin.name}:`, error);
      }
    }
  }

  // 图片右键菜单事件
  private imageMenuEvent(event: any) {
    this.delegateEvent("imageMenuEvent", event);
  }

  openSetting(): void {
    this.openGlobalSetting();
  }

  openGlobalSetting(): void {
    let dialog = new Dialog({
      title: "配置",
      content: `<div id="hqweay-setting-pannel" style="height: 600px;"></div>`,
      width: "800px",
      destroyCallback: () => {
        //log.info("destroyCallback", options);
        pannel.$destroy();
      },
    });

    let pannel = new SettingPannel({
      target: dialog.element.querySelector("#hqweay-setting-pannel"),
    });
  }

  updateProtyleToolbar(toolbar: Array<string | any>) {
    const plugins = this.pluginRegistry?.getAllPlugins();
    if (!plugins) return toolbar;
    // //log.info("updateProtyleToolbar", plugins);
    for (const plugin of plugins) {
      if (plugin.enabled && plugin.updateProtyleToolbar) {
        try {
          toolbar = plugin.updateProtyleToolbar(toolbar);
        } catch (error) {
          log.error(
            `Error in updateProtyleToolbar for plugin ${plugin.name}:`,
            error,
          );
        }
      }
    }
    return toolbar;
  }
}
