export function displayMode(value: unknown): "floating" | "tab" {
  return value === "tab" ? "tab" : "floating";
}

export type AgentSurface = "desktop-floating" | "desktop-tab" | "mobile-dropdown";

export function resolveAgentSurface(frontend: string, configuredMode: unknown): AgentSurface {
  if (frontend === "mobile" || frontend === "browser-mobile") return "mobile-dropdown";
  return displayMode(configuredMode) === "tab" ? "desktop-tab" : "desktop-floating";
}

export function selectedBlockIds(root: ParentNode = document): string[] {
  return Array.from(new Set(Array.from(root.querySelectorAll<HTMLElement>(
    ".protyle-wysiwyg--select[data-node-id], .protyle-wysiwyg [data-node-id].protyle-wysiwyg--select",
  ))
    .map((element) => element.dataset.nodeId)
    .filter((id): id is string => Boolean(id))));
}

export function isAgentMenuTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as { closest?: unknown }).closest !== "function") return false;
  return Boolean((target as unknown as { closest(selector: string): unknown }).closest(
    "#addToAgent, [data-id=\"addToAgent\"], [data-type=\"addToAgent\"]",
  ));
}

export function isMobileAgentEntryTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as { closest?: unknown }).closest !== "function") return false;
  return Boolean((target as unknown as { closest(selector: string): unknown }).closest("#menuAgentChat"));
}
