import type { ICommand, IMenu, IPluginDockTab, Menu, Plugin } from "siyuan";
import { isMobileEntryFrontend, type PluginEntrySurface } from "./plugin-entry-settings";

export interface UnifiedEntryDock {
  type: string;
  config: IPluginDockTab;
  data: unknown;
  activation?: "panel" | "action";
  init(target: HTMLElement): void;
  destroy?(target: HTMLElement): void;
}

export interface UnifiedEntryDefinition {
  id: string;
  title: string;
  icon: string;
  execute(): void;
  menuItem?: (execute: () => void) => IMenu;
  command?: {
    langKey: string;
    hotkey?: string;
  };
  dock?: UnifiedEntryDock;
}

type UnifiedEntryHost = Pick<Plugin, "addCommand" | "addDock"> & {
  commands?: ICommand[];
  docks?: Record<string, unknown>;
  name?: string;
};
type ManagedEntrySurface = Extract<PluginEntrySurface, "menu" | "dock" | "command">;

/**
 * Declares one user-facing action once, then exposes it consistently through
 * SiYuan's command palette, Damophus top-bar menu, and optional Dock surface.
 */
export class UnifiedEntryPoint {
  private commandRegistered = false;
  private registeredCommand?: ICommand;
  private dockRegistered = false;
  private dockKey?: string;
  private dockTarget?: HTMLElement;
  private dockInitialized = false;
  private dockActionListenerAttached = false;
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
    if (!this.enabled || !this.surfaces.dock || this.dockRegistered || !this.definition.dock) return;
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
    this.dockKey = this.resolveDockKey(dock.type);
    this.syncDockVisibility();
  }

  openDock(): boolean {
    if (!this.enabled || !this.surfaces.dock || typeof document === "undefined" || isMobileEntryFrontend()) return false;
    const dockType = this.definition.dock?.type;
    const dock = dockType
      ? [...document.querySelectorAll<HTMLElement>(".dock__item[data-type]")]
        .find((element) => this.matchesDockType(element.dataset.type, dockType))
      : undefined;
    if (!dock) return false;
    dock.click();
    return true;
  }

  addMenuItem(menu: Menu): void {
    if (!this.enabled || !this.surfaces.menu) return;
    menu.addItem(this.menuItem());
  }

  menuItem(): IMenu {
    if (this.definition.menuItem) return this.definition.menuItem(() => this.definition.execute());
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
    if (!dockType) return;
    const active = this.enabled && this.surfaces.dock;
    this.syncDockActionListener(active);
    if (active && !this.dockRegistered) this.registerDock();
    if (!active && this.dockRegistered && this.dockKey && this.host.docks) {
      delete this.host.docks[this.dockKey];
      this.dockRegistered = false;
      this.dockKey = undefined;
    }
    if (isMobileEntryFrontend()) {
      return;
    }
    if (typeof document === "undefined") return;
    const hidden = !this.enabled || !this.surfaces.dock;
    const apply = () => {
      document.querySelectorAll<HTMLElement>(".dock__item[data-type]").forEach((element) => {
        if (!this.matchesDockType(element.dataset.type, dockType)) return;
        element.hidden = hidden;
        element.style.display = hidden ? "none" : "";
        element.setAttribute("aria-hidden", String(hidden));
        const icon = this.definition.dock?.config.icon;
        const use = icon ? element.querySelector<SVGUseElement>("svg use") : undefined;
        if (use && icon) {
          use.setAttribute("href", `#${icon}`);
          use.setAttribute("xlink:href", `#${icon}`);
        }
      });
    };
    apply();
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(apply);
  }

  private syncDockActionListener(active: boolean): void {
    if (this.definition.dock?.activation !== "action") return;
    const shouldAttach = active && typeof document !== "undefined" && !isMobileEntryFrontend();
    if (shouldAttach === this.dockActionListenerAttached) return;
    this.dockActionListenerAttached = shouldAttach;
    document[shouldAttach ? "addEventListener" : "removeEventListener"](
      "click",
      this.handleDockActionClick,
      true,
    );
  }

  private readonly handleDockActionClick = (event: MouseEvent): void => {
    if (!this.enabled || !this.surfaces.dock) return;
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>(".dock__item[data-type]") : null;
    const dockType = this.definition.dock?.type;
    if (!target || !dockType || !this.matchesDockType(target.dataset.type, dockType)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.definition.execute();
  };

  private matchesDockType(actualType: string | undefined, dockType: string): boolean {
    return actualType === dockType || actualType?.endsWith(dockType) === true;
  }

  private resolveDockKey(dockType: string): string | undefined {
    const dockKeys = this.host.docks ? Object.keys(this.host.docks) : [];
    return dockKeys.find((key) => this.matchesDockType(key, dockType))
      ?? (this.host.name ? `${this.host.name}${dockType}` : undefined);
  }
}
