import type { ICommand, IMenu, IPluginDockTab, Menu, Plugin } from "siyuan";
import type { PluginEntrySurface } from "./plugin-entry-settings";

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
type ManagedEntrySurface = Exclude<PluginEntrySurface, "tab">;

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
  private surfaces: Record<ManagedEntrySurface, boolean> = {
    menu: true,
    dock: true,
    command: true,
  };

  constructor(
    private readonly definition: UnifiedEntryDefinition,
    private readonly host: UnifiedEntryHost,
  ) {}

  registerCommand(): void {
    if (!this.enabled || !this.surfaces.command || this.commandRegistered || !this.definition.command) return;
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
    if (!this.enabled || !this.surfaces.menu) return;
    menu.addItem(this.menuItem());
  }

  menuItem(): IMenu {
    return {
      icon: this.definition.icon,
      label: this.definition.title,
      click: () => {
        if (this.enabled && this.surfaces.menu) this.definition.execute();
      },
    };
  }

  destroyDockContent(): void {
    if (this.dockTarget && this.dockInitialized) this.definition.dock?.destroy?.(this.dockTarget);
    this.dockInitialized = false;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.syncCommandState();
    this.syncDockVisibility();
    this.syncDockState();
  }

  setSurfaces(surfaces: Partial<Record<ManagedEntrySurface, boolean>>): void {
    this.surfaces = { ...this.surfaces, ...surfaces };
    this.syncCommandState();
    this.syncDockVisibility();
    this.syncDockState();
  }

  private syncCommandState(): void {
    if (this.enabled && this.surfaces.command) this.registerCommand();
    else this.unregisterCommand();
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
    const active = this.enabled && this.surfaces.dock;
    if (active && !this.dockInitialized) {
      this.definition.dock.init(this.dockTarget);
      this.dockInitialized = true;
    } else if (!active && this.dockInitialized) {
      this.definition.dock.destroy?.(this.dockTarget);
      this.dockInitialized = false;
    }
  }

  private syncDockVisibility(): void {
    const dockType = this.definition.dock?.type;
    if (!dockType || typeof document === "undefined") return;
    const hidden = !this.enabled || !this.surfaces.dock;
    const apply = () => {
      document.querySelectorAll<HTMLElement>(".dock__item[data-type]").forEach((element) => {
        if (element.dataset.type !== dockType) return;
        element.hidden = hidden;
        element.style.display = hidden ? "none" : "";
        element.setAttribute("aria-hidden", String(hidden));
      });
    };
    apply();
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(apply);
  }
}
