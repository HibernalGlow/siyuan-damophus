export type StyleBrushScope = "document" | "heading";

export interface StyleBrushBlock {
  id: string;
  type: string;
  subtype?: string;
}

const NODE_ID_PATTERN = /^\d{14}-[a-z0-9]{7}$/u;

export function isValidStyleBrushBlockId(value: unknown): value is string {
  return typeof value === "string" && NODE_ID_PATTERN.test(value);
}

export function sourceBlockId(elements: HTMLElement[]): string | undefined {
  if (elements.length !== 1) return undefined;
  const id = elements[0]?.dataset.nodeId;
  return isValidStyleBrushBlockId(id) ? id : undefined;
}

function isHeadingBlockType(type: string): boolean {
  return type === "h" || type === "NodeHeading";
}

export function nearestHeadingId(
  source: StyleBrushBlock,
  breadcrumbs: StyleBrushBlock[],
): string | undefined {
  if (isHeadingBlockType(source.type)) return source.id;
  for (let index = breadcrumbs.length - 1; index >= 0; index -= 1) {
    if (isHeadingBlockType(breadcrumbs[index]?.type ?? "")) return breadcrumbs[index]?.id;
  }
  return undefined;
}

export function matchingStyleBrushTargetIds(
  source: StyleBrushBlock,
  candidates: StyleBrushBlock[],
  allowedIds?: ReadonlySet<string>,
): string[] {
  const subtype = source.subtype ?? "";
  const seen = new Set<string>();
  const matches: string[] = [];

  for (const candidate of candidates) {
    if (!isValidStyleBrushBlockId(candidate.id)) continue;
    if (candidate.id === source.id || seen.has(candidate.id)) continue;
    if (allowedIds && !allowedIds.has(candidate.id)) continue;
    if (candidate.type !== source.type || (candidate.subtype ?? "") !== subtype) continue;
    seen.add(candidate.id);
    matches.push(candidate.id);
  }

  return matches;
}

export function styleBrushBlockAttrs(
  targetIds: string[],
  style: string,
): Array<{ id: string; attrs: { style: string } }> {
  return targetIds.map((id) => ({ id, attrs: { style } }));
}
