import type { ICommand, IMenu, IPluginDockTab, Menu, Plugin } from "siyuan";

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

type UnifiedEntryHost = Pick<Plugin, "addCommand" | "addDock"> & Partial<Pick<Plugin, "commands">>;

/**
 * Declares one user-facing action once, then exposes it consistently through
 * SiYuan's command palette, Damophus top-bar menu, and optional Dock surface.
 */
export class UnifiedEntryPoint {
  private commandRegistered = false;
  private registeredCommand?: ICommand;
  private dockRegistered = false;
  private dockTarget?: HTMLElement;
  private dockInitialized = false;
  private enabled = true;

  constructor(
    private readonly definition: UnifiedEntryDefinition,
    private readonly host: UnifiedEntryHost,
  ) {}

  registerCommand(): void {
    if (this.commandRegistered || !this.definition.command) return;
    this.commandRegistered = true;
    this.registeredCommand = {
      langKey: this.definition.command.langKey,
      hotkey: this.definition.command.hotkey ?? "",
      callback: () => {
        if (this.enabled) this.definition.execute();
      },
    };
    this.host.addCommand(this.registeredCommand);
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
        owner.syncDockState();
      },
      destroy() {
        if (owner.dockTarget && owner.dockInitialized) dock.destroy?.(owner.dockTarget);
        owner.dockInitialized = false;
        owner.dockTarget = undefined;
      },
    });
    this.syncDockVisibility();
  }

  addMenuItem(menu: Menu): void {
    if (!this.enabled) return;
    menu.addItem(this.menuItem());
  }

  menuItem(): IMenu {
    return {
      icon: this.definition.icon,
      label: this.definition.title,
      click: () => {
        if (this.enabled) this.definition.execute();
      },
    };
  }

  destroyDockContent(): void {
    if (this.dockTarget && this.dockInitialized) this.definition.dock?.destroy?.(this.dockTarget);
    this.dockInitialized = false;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) this.registerCommand();
    else this.unregisterCommand();
    this.syncDockVisibility();
    this.syncDockState();
  }

  private unregisterCommand(): void {
    if (!this.commandRegistered || !this.registeredCommand) return;
    const commands = this.host.commands;
    if (commands) {
      const index = commands.findIndex((command) => command === this.registeredCommand);
      if (index >= 0) commands.splice(index, 1);
    }
    this.commandRegistered = false;
    this.registeredCommand = undefined;
  }

  private syncDockState(): void {
    if (!this.dockTarget || !this.definition.dock) return;
    if (this.enabled && !this.dockInitialized) {
      this.definition.dock.init(this.dockTarget);
      this.dockInitialized = true;
    } else if (!this.enabled && this.dockInitialized) {
      this.definition.dock.destroy?.(this.dockTarget);
      this.dockInitialized = false;
    }
  }

  private syncDockVisibility(): void {
    const dockType = this.definition.dock?.type;
    if (!dockType || typeof document === "undefined") return;
    const apply = () => {
      document.querySelectorAll<HTMLElement>(".dock__item[data-type]").forEach((element) => {
        if (element.dataset.type !== dockType) return;
        element.hidden = !this.enabled;
        element.style.display = this.enabled ? "" : "none";
        element.setAttribute("aria-hidden", String(!this.enabled));
      });
    };
    apply();
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(apply);
  }
}
