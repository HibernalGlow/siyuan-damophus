export type DockPlatform = "desktop" | "mobile" | "both";
export type DockPlatformTarget = "desktop" | "mobile";

export const DOCK_PLATFORMS: readonly DockPlatform[] = ["desktop", "mobile", "both"];

const DESKTOP_FRONTENDS = ["desktop", "browser-desktop", "desktop-window"] as const;
const MOBILE_FRONTENDS = ["mobile", "browser-mobile"] as const;

export function normalizeDockPlatform(value: unknown): DockPlatform {
  return DOCK_PLATFORMS.includes(value as DockPlatform) ? (value as DockPlatform) : "both";
}

export function normalizeDockPlatformMap(value: unknown): Record<string, DockPlatform> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, DockPlatform> = {};
  for (const [type, platform] of Object.entries(value as Record<string, unknown>)) {
    const key = typeof type === "string" ? type.trim() : "";
    if (!key) continue;
    result[key] = normalizeDockPlatform(platform);
  }
  return result;
}

/**
 * A dock button is hidden on one frontend when it is pinned to the other one.
 * Unlisted buttons and "both" entries stay visible everywhere.
 */
export function isDockHiddenOn(pinned: DockPlatform, platform: DockPlatformTarget): boolean {
  return pinned !== "both" && pinned !== platform;
}

function escapeCssAttribute(value: string): string {
  return value.replace(/["\\]/gu, "\\$&");
}

/**
 * Builds the runtime stylesheet that hides dock buttons on the frontends they
 * are not configured for. Dock buttons share `.dock__item[data-type=...]` across
 * desktop and the latest mobile dock, so one selector shape covers both.
 */
export function buildDockVisibilityCss(map: Record<string, DockPlatform>): string {
  const rules: string[] = [];
  const emit = (frontend: readonly string[], types: string[]) => {
    if (types.length === 0) return;
    const selectors = frontend
      .flatMap((frontendValue) => types.map((type) => `html[data-frontend="${frontendValue}"] .dock__item[data-type="${escapeCssAttribute(type)}"]`))
      .join(",\n");
    rules.push(`${selectors} { display: none !important; }`);
  };
  emit(DESKTOP_FRONTENDS, Object.entries(map).filter(([, platform]) => platform === "mobile").map(([type]) => type));
  emit(MOBILE_FRONTENDS, Object.entries(map).filter(([, platform]) => platform === "desktop").map(([type]) => type));
  return rules.join("\n");
}
