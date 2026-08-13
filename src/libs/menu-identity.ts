import type { IMenu } from "siyuan";

export const MENU_PLUGIN_ATTRIBUTE = "data-plugin-id";
export const MENU_MODULE_ATTRIBUTE = "data-damophus-module";
export const MENU_DECLARATION_ATTRIBUTE = "data-damophus-declaration";

export interface MenuIdentity {
  plugin?: string;
  module?: string;
  declaration?: string | readonly string[];
}

export function markMenuIdentity(element: HTMLElement, identity: MenuIdentity): HTMLElement {
  if (identity.plugin) element.setAttribute(MENU_PLUGIN_ATTRIBUTE, identity.plugin);
  if (identity.module) element.setAttribute(MENU_MODULE_ATTRIBUTE, identity.module);
  if (identity.declaration) {
    const declaration = typeof identity.declaration === "string"
      ? identity.declaration
      : identity.declaration.join("/");
    element.setAttribute(MENU_DECLARATION_ATTRIBUTE, declaration);
  }
  return element;
}

export function bindMenuIdentity(item: IMenu, identity: MenuIdentity): IMenu {
  const existingBind = item.bind;
  return {
    ...item,
    bind: (element) => {
      existingBind?.(element);
      markMenuIdentity(element, identity);
    },
  };
}

type MenuLike = { addItem: (item: IMenu) => unknown };
type EventBusLike = {
  on: (type: string, listener: (...args: any[]) => any) => unknown;
  off: (type: string, listener: (...args: any[]) => any) => unknown;
};

type EmittingEventBusLike = {
  emit: (type: string, detail?: any) => unknown;
};

interface EventBusPrototypeLike {
  emit: EmittingEventBusLike["emit"];
}

const identityListeners = new WeakMap<(...args: any[]) => any, (...args: any[]) => any>();

export function withMenuIdentity<T>(menu: MenuLike, identity: MenuIdentity, action: () => T): T {
  const originalAddItem = menu.addItem;
  menu.addItem = ((item: IMenu) => originalAddItem.call(menu, bindMenuIdentity(item, identity))) as MenuLike["addItem"];
  try {
    return action();
  } finally {
    menu.addItem = originalAddItem;
  }
}

function menuFromEvent(args: any[]): MenuLike | undefined {
  const menu = args[0]?.detail?.menu;
  return menu && typeof menu.addItem === "function" ? menu : undefined;
}

export function withMenuEventIdentityRegistration<T>(eventBus: EventBusLike, identity: MenuIdentity, action: () => T): T {
  const originalOn = eventBus.on;
  const originalOff = eventBus.off;
  eventBus.on = ((type: string, listener: (...args: any[]) => any) => {
    const wrapped = function(this: unknown, ...args: any[]) {
      const menu = menuFromEvent(args);
      return menu ? withMenuIdentity(menu, identity, () => listener.apply(this, args)) : listener.apply(this, args);
    };
    identityListeners.set(listener, wrapped);
    return originalOn.call(eventBus, type, wrapped);
  }) as EventBusLike["on"];
  eventBus.off = ((type: string, listener: (...args: any[]) => any) => (
    originalOff.call(eventBus, type, identityListeners.get(listener) ?? listener)
  )) as EventBusLike["off"];
  const restore = () => {
    eventBus.on = originalOn;
    eventBus.off = originalOff;
  };
  let result: T;
  try {
    result = action();
  } catch (error) {
    restore();
    throw error;
  }
  if (result && typeof (result as any).then === "function") return Promise.resolve(result).finally(restore) as T;
  restore();
  return result;
}

const installedEventBusPrototypes = new WeakMap<EventBusPrototypeLike, {
  originalEmit: EmittingEventBusLike["emit"];
  references: number;
}>();

function pluginIdFromEventBus(eventBus: unknown): string | undefined {
  const target = (eventBus as { eventTarget?: { data?: unknown; nodeValue?: unknown } })?.eventTarget;
  const value = target?.data ?? target?.nodeValue;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * SiYuan creates one EventBus per plugin and stores the plugin package name on
 * its backing Comment node. Instrumenting the shared emit prototype therefore
 * identifies every plugin menu contribution, including listeners registered
 * before Damophus loads, without matching translated menu labels.
 */
export function installPluginMenuIdentityInstrumentation(
  eventBus: EmittingEventBusLike,
): () => void {
  const prototype = Object.getPrototypeOf(eventBus) as EventBusPrototypeLike | null;
  if (!prototype || typeof prototype.emit !== "function") return () => {};

  const installed = installedEventBusPrototypes.get(prototype);
  if (installed) {
    installed.references += 1;
    return () => uninstallPluginMenuIdentityInstrumentation(prototype);
  }

  const originalEmit = prototype.emit;
  prototype.emit = function(this: EmittingEventBusLike, type: string, detail?: any) {
    const menu = detail?.menu;
    const pluginId = pluginIdFromEventBus(this);
    if (!pluginId || !menu || typeof menu.addItem !== "function") {
      return originalEmit.call(this, type, detail);
    }
    return withMenuIdentity(menu, { plugin: pluginId }, () => originalEmit.call(this, type, detail));
  };
  installedEventBusPrototypes.set(prototype, { originalEmit, references: 1 });
  return () => uninstallPluginMenuIdentityInstrumentation(prototype);
}

function uninstallPluginMenuIdentityInstrumentation(prototype: EventBusPrototypeLike): void {
  const installed = installedEventBusPrototypes.get(prototype);
  if (!installed) return;
  installed.references -= 1;
  if (installed.references > 0) return;
  prototype.emit = installed.originalEmit;
  installedEventBusPrototypes.delete(prototype);
}
