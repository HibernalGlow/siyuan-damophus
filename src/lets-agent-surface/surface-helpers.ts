export type AgentSurface = "desktop-native" | "desktop-tab" | "mobile-dropdown";

export function createAgentModeToggle(
  openInNewTab: boolean,
  label: string,
  setOpenInNewTab: (value: boolean) => void,
) {
  return {
    icon: "iconLayout",
    label,
    checked: openInNewTab,
    click: () => setOpenInNewTab(!openInNewTab),
  };
}

export function resolveAgentSurface(frontend: string, openInNewTab: unknown): AgentSurface {
  if (frontend === "mobile" || frontend === "browser-mobile") return "mobile-dropdown";
  return openInNewTab === true ? "desktop-tab" : "desktop-native";
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
