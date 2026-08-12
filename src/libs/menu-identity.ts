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
