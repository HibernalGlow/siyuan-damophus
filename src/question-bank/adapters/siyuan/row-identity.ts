import type { RawAttributeView } from "./types";

export interface QuestionRowIdentity {
  itemId: string;
  sourceBlockId?: string;
}

export interface QuestionRowIdentityMaps {
  rows: QuestionRowIdentity[];
  itemIdByValueBlockId: ReadonlyMap<string, string>;
  sourceBlockIdByItemId: ReadonlyMap<string, string>;
}

export function questionRowIdentityMaps(
  av: RawAttributeView,
  primaryKeyId: string,
): QuestionRowIdentityMaps {
  const primaryValues = av.keyValues.find(
    (keyValues) => keyValues.key.id === primaryKeyId,
  )?.values ?? [];
  const itemIdByValueBlockId = new Map<string, string>();
  const sourceBlockIdByItemId = new Map<string, string>();
  const rows = primaryValues.map((value) => {
    const row = { itemId: value.blockID, sourceBlockId: value.block?.id };
    itemIdByValueBlockId.set(row.itemId, row.itemId);
    if (row.sourceBlockId) {
      itemIdByValueBlockId.set(row.sourceBlockId, row.itemId);
      sourceBlockIdByItemId.set(row.itemId, row.sourceBlockId);
    }
    return row;
  });
  return { rows, itemIdByValueBlockId, sourceBlockIdByItemId };
}
