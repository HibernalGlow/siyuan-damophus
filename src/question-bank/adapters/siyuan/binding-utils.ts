import type { RawAttributeView } from "./types";

export function databaseMarkdown(blockId: string, avId: string): string {
  return `<div data-type="NodeAttributeView" data-av-id="${avId}" data-av-type="table"></div>\n{: id="${blockId}"}`;
}

export function primaryKeyId(av: RawAttributeView): string {
  const key = av.keyValues.find((value) => value.key.type === "block")?.key.id;
  if (!key) throw new Error(`Attribute view ${av.id} has no block primary key`);
  return key;
}

export function hashToken(value: unknown): string {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function migratedKeyId(
  binding: { systemDocumentId: string; questionIndex: { avId: string }; attemptLog: { avId: string } },
  field: string,
): string {
  const prefix = binding.systemDocumentId.slice(0, 14);
  return `${prefix}-${hashToken(`${binding.questionIndex.avId}:${binding.attemptLog.avId}:${field}`)
    .padStart(7, "0")}`;
}
