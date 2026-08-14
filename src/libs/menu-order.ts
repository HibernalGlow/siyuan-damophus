import { orderByPreference } from "./settings-nav-state";

export const MENU_ORDER_KEY = "uiPluginMenuOrder";

export function parseMenuOrder(raw: unknown): string[] | undefined {
  return Array.isArray(raw) && raw.every((entry) => typeof entry === "string")
    ? raw
    : undefined;
}

export function orderPluginNames(names: string[], preference: string[] | undefined): string[] {
  return orderByPreference(names, preference);
}

export function moveMenuEntry(names: string[], name: string, direction: "up" | "down"): string[] {
  const index = names.indexOf(name);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= names.length) return names;
  const next = [...names];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
