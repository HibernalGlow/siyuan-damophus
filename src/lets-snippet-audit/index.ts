import { mount, unmount } from "svelte";
import { openTab, type Menu } from "siyuan";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { resolveSiyuanPluginIcon } from "@/libs/plugin-icons";
import { plugin } from "@/utils";
import SnippetAuditSettings from "./SnippetAuditSettings.svelte";
import { snippetAuditTabTarget, snippetAuditTabType } from "./tab-contract";

const icon = resolveSiyuanPluginIcon("listTree");

export default class SnippetAuditPlugin extends SubPluginBase {
  private tabRegistered = false;
  private readonly mountedTabs = new Map<HTMLElement, ReturnType<typeof mount>>();

  override registerModels(): void {
    if (this.tabRegistered) return;
    this.tabRegistered = true;
    const owner = this;
    plugin.addTab({
      type: snippetAuditTabType,
      init() {
        const element = this.element as HTMLElement;
        element.classList.add("damophus-theme-root", "damophus-question-bank-theme", "h-full", "overflow-auto", "bg-background", "text-foreground", "p-5");
        owner.mountedTabs.set(element, mount(SnippetAuditSettings, {
          target: element,
          props: { title: owner.t("lets-snippet-audit.displayName") },
        }));
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
    menu.addItem({ icon, label: this.t("lets-snippet-audit.menuOpen"), click: () => this.openInTab() });
  }

  override onunload(): void {
    for (const app of this.mountedTabs.values()) void unmount(app);
    this.mountedTabs.clear();
  }

  private openInTab(): void {
    if (!this.isEntryEnabled("tab")) return;
    void openTab({
      app: plugin.app,
      custom: {
        icon,
        title: this.t("lets-snippet-audit.displayName"),
        ...snippetAuditTabTarget(plugin.name),
      },
    });
  }
}
