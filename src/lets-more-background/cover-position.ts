export const COVER_POSITION_ATTRIBUTE = "custom-damophus-cover-position";
// Mobile cover containers crop portrait images differently (narrow viewport,
// native mobile pins the cover height), so the vertical percentage carries a
// different visual meaning per platform family. Mobile adjustments live in
// their own attribute; desktop never reads or writes it, and it is only
// created once the position is actually adjusted on a mobile device.
export const COVER_POSITION_MOBILE_ATTRIBUTE = "custom-damophus-cover-position-mobile";
// Runtime-only DOM marker on .protyle-background recording the last restored
// position. Lets repeat scans of the same DOM skip the getBlockAttrs round trip.
export const COVER_POSITION_MARKER = "data-damophus-cover-pos";

/** Read the vertical cover position from a title-img declaration or CSS value. */
export function parseCoverPosition(value: unknown): number | null {
  const text = String(value ?? "")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&amp;/gi, "&");
  const match = text.match(/(?:object|background)-position\s*:\s*(?:[^;\s]+\s+)?(-?\d+(?:\.\d+)?)\s*%/i);
  const valueMatch = match ?? [...text.matchAll(/(-?\d+(?:\.\d+)?)\s*%/g)].at(-1);
  if (!valueMatch) return null;
  const parsed = Number(valueMatch[1]);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null;
}

export function normalizeCoverPosition(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null;
}

export function serializeCoverPosition(value: unknown): string | null {
  const normalized = normalizeCoverPosition(value);
  return normalized === null ? null : String(Number(normalized.toFixed(2)));
}

/**
 * Restore priority: the platform-specific attribute wins, then the shared
 * attribute, then the legacy object-position inside title-img. Desktop never
 * reads the mobile attribute so per-platform adjustments stay independent.
 */
export function selectCoverPositionFromAttrs(
  attrs: Record<string, string>,
  mobilePlatform: boolean,
): number | null {
  const shared = normalizeCoverPosition(attrs[COVER_POSITION_ATTRIBUTE]);
  const legacy = parseCoverPosition(attrs["title-img"] || attrs["custom-title-img"]);
  if (mobilePlatform) {
    return normalizeCoverPosition(attrs[COVER_POSITION_MOBILE_ATTRIBUTE]) ?? shared ?? legacy;
  }
  return shared ?? legacy;
}
