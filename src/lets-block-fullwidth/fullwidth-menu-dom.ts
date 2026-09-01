import { markMenuIdentity } from "@/libs/menu-identity";

export const MENU_IDENTITY = { plugin: "siyuan-damophus", module: "blockFullwidth" } as const;

export const AFWD_MENU_ENTRY_ID = "damo-afwd-menu-entry";
export const AFWD_MENU_SEPARATOR_ID = "damo-afwd-menu-separator";
export const AFWD_MENU_CLEAR_ID = "damo-afwd-menu-clear";
export const AFWD_MENU_ITEM_PREFIX = "damo-afwd-menu-item-";

export type FullwidthLabelKey =
  | "entry"
  | "all"
  | "db"
  | "t"
  | "p"
  | "iframe"
  | "sb"
  | "on"
  | "deep"
  | "off"
  | "clear";

export type FullwidthMenuLabels = Record<FullwidthLabelKey, string>;

export function afwdMenuItemId(value: string): string {
  return `${AFWD_MENU_ITEM_PREFIX}${value}`;
}

const DOC_ROW_ICONS: Record<string, string> = {
  all: `<svg class="b3-menu__icon"></svg>`,
  db: `<svg class="b3-menu__icon"><use xlink:href="#iconDatabase"></use></svg>`,
  t: `<svg class="b3-menu__icon"><use xlink:href="#iconTable"></use></svg>`,
  p: `<svg class="b3-menu__icon"><use xlink:href="#iconImage"></use></svg>`,
  iframe: `<svg class="b3-menu__icon"><use xlink:href="#iconHTML5"></use></svg>`,
  sb: `<svg class="b3-menu__icon"><use xlink:href="#iconSuper"></use></svg>`,
};

const BLOCK_ROW_ICONS: Record<string, string> = {
  on: `<svg class="b3-menu__icon" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12l2 2l4-4"/></g></svg>`,
  deep: `<svg class="b3-menu__icon" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M3 12h18M3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4"/></g></svg>`,
  off: `<svg class="b3-menu__icon" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m15 9l-6 6m0-6l6 6"/></g></svg>`,
};

const ENTRY_ICON = `<svg class="b3-menu__icon" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 18 18"><path fill="currentColor" d="m15.503 15.003l-.735.71a.75.75 0 1 0 1.042 1.078l1.886-1.82a1 1 0 0 0 0-1.44l-1.886-1.82a.75.75 0 0 0-1.042 1.079l.739.713H12.75a.75.75 0 0 0 0 1.5zM15 3a2 2 0 0 1 2 2v4.25a.75.75 0 0 1-1.5 0V5a.5.5 0 0 0-.5-.5H5a.5.5 0 0 0-.5.5v4.25a.75.75 0 0 1-1.5 0V5a2 2 0 0 1 2-2zM5.234 15.712l-.735-.71h2.752a.75.75 0 1 0 0-1.5H4.495l.739-.713a.75.75 0 0 0-1.042-1.078l-1.886 1.82a1 1 0 0 0 0 1.44l1.886 1.82a.75.75 0 0 0 1.042-1.079"/></svg>`;

function docRowHtml(key: string, label: string): string {
  return `
        <button class="b3-menu__item b3-menu__item--custom" id="${afwdMenuItemId(key)}">
            <span class="b3-menu__label">
                <div class="fn__flex">
                    ${DOC_ROW_ICONS[key] ?? ""}
                    <span>${label}</span>
                    <span class="fn__space fn__flex-1"></span>
                    <input type="checkbox" class="b3-switch fn__flex-center">
                </div>
            </span>
        </button>`;
}

function blockRowHtml(key: string, label: string): string {
  return `
        <button class="b3-menu__item b3-menu__item--custom" id="${afwdMenuItemId(key)}">
            ${BLOCK_ROW_ICONS[key] ?? ""}
            <span class="b3-menu__label">${label}</span>
        </button>`;
}

export function buildFullwidthMenuEntry(
  isDoc: boolean,
  labels: FullwidthMenuLabels,
  blockKeys: readonly string[] = ["on", "off"],
): HTMLButtonElement {
  const entry = document.createElement("button");
  entry.className = "b3-menu__item";
  entry.id = AFWD_MENU_ENTRY_ID;

  const rowKeys = isDoc ? ["all", "db", "t", "p", "iframe", "sb"] : [...blockKeys];
  const rows = rowKeys
    .map((key) => (isDoc ? docRowHtml(key, labels[key as FullwidthLabelKey]) : blockRowHtml(key, labels[key as FullwidthLabelKey])))
    .join("");

  entry.innerHTML = `
        ${ENTRY_ICON}
        <span class="b3-menu__label">${labels.entry}</span>
        <svg class="b3-menu__icon b3-menu__icon--small"><use xlink:href="#iconRight"></use></svg>
        <div class="b3-menu__submenu">
            <div class="b3-menu__items">
                ${rows}
                <button class="b3-menu__separator"></button>
                <button class="b3-menu__item" id="${AFWD_MENU_CLEAR_ID}">
                    <svg class="b3-menu__icon"><use xlink:href="#iconTrashcan"></use></svg>
                    <span class="b3-menu__label">${labels.clear}</span>
                </button>
            </div>
        </div>`;

  markMenuIdentity(entry, MENU_IDENTITY);
  entry.querySelectorAll<HTMLElement>("button[id]").forEach((button) => {
    markMenuIdentity(button, MENU_IDENTITY);
  });
  return entry;
}
