import type { IMenu, IPluginDockTab, Menu, Plugin } from "siyuan";

export interface UnifiedEntryDock {
  type: string;
  config: IPluginDockTab;
  data: unknown;
  init(target: HTMLElement): void;
  destroy?(target: HTMLElement): void;
}

export interface UnifiedEntryDefinition {
  id: string;
  title: string;
  icon: string;
  execute(): void;
  command?: {
    langKey: string;
    hotkey?: string;
  };
  dock?: UnifiedEntryDock;
}

/**
 * Declares one user-facing action once, then exposes it consistently through
 * SiYuan's command palette, Damophus top-bar menu, and optional Dock surface.
 */
export class UnifiedEntryPoint {
  private commandRegistered = false;
  private dockRegistered = false;
  private dockTarget?: HTMLElement;

  constructor(
    private readonly definition: UnifiedEntryDefinition,
    private readonly host: Pick<Plugin, "addCommand" | "addDock">,
  ) {}

  registerCommand(): void {
    if (this.commandRegistered || !this.definition.command) return;
    this.commandRegistered = true;
    this.host.addCommand({
      langKey: this.definition.command.langKey,
      hotkey: this.definition.command.hotkey ?? "",
      callback: () => this.definition.execute(),
    });
  }

  registerDock(): void {
    if (this.dockRegistered || !this.definition.dock) return;
    this.dockRegistered = true;
    const dock = this.definition.dock;
    const owner = this;
    this.host.addDock({
      config: dock.config,
      data: dock.data,
      type: dock.type,
      init() {
        owner.dockTarget = this.element as HTMLElement;
        dock.init(owner.dockTarget);
      },
      destroy() {
        if (owner.dockTarget) dock.destroy?.(owner.dockTarget);
        owner.dockTarget = undefined;
      },
    });
  }

  addMenuItem(menu: Menu): void {
    menu.addItem(this.menuItem());
  }

  menuItem(): IMenu {
    return {
      icon: this.definition.icon,
      label: this.definition.title,
      click: () => this.definition.execute(),
    };
  }

  destroyDockContent(): void {
    if (this.dockTarget) this.definition.dock?.destroy?.(this.dockTarget);
    this.dockTarget = undefined;
  }
}
