// Device-local presentation preferences for the mobile quick-access bubble.
// They must never travel with synced document data, so plain localStorage is
// the right home (same policy as cache paths: per-device, rebuildable).
export interface FabPosition {
  right: number;
  bottom: number;
}

const PINNED_KEY = "damophus-question-bank.fab-pinned";
const POSITION_KEY = "damophus-question-bank.fab-position";

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadFabPinned(): boolean {
  return store()?.getItem(PINNED_KEY) !== "false";
}

export function saveFabPinned(pinned: boolean): void {
  try {
    store()?.setItem(PINNED_KEY, String(pinned));
  } catch {
    /* private-mode storage: keep the preference in memory only */
  }
}

export function loadFabPosition(): FabPosition | null {
  const raw = store()?.getItem(POSITION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<FabPosition>;
    if (typeof parsed.right !== "number" || typeof parsed.bottom !== "number") return null;
    if (!Number.isFinite(parsed.right) || !Number.isFinite(parsed.bottom)) return null;
    return { right: parsed.right, bottom: parsed.bottom };
  } catch {
    return null;
  }
}

export function saveFabPosition(position: FabPosition): void {
  try {
    store()?.setItem(POSITION_KEY, JSON.stringify(position));
  } catch {
    /* private-mode storage: keep the preference in memory only */
  }
}
