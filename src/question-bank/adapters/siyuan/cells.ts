import type { AttributeViewKeyType, SiyuanKernelClient } from "./types";

export interface AttributeViewCellInput {
  type: AttributeViewKeyType;
  text?: { content: string } | null;
  number?: { content?: number; isNotEmpty: boolean };
  date?: { content?: number; isNotEmpty: boolean; isNotTime?: boolean };
  mSelect?: Array<{ content: string; color: string }>;
  relation?: { blockIDs: string[] };
}

export function textCell(content: string | undefined): AttributeViewCellInput {
  return { type: "text", text: { content: content ?? "" } };
}

export function numberCell(content: number | undefined): AttributeViewCellInput {
  return {
    type: "number",
    text: null,
    number: content === undefined ? { isNotEmpty: false } : { content, isNotEmpty: true },
  };
}

export function durationMinutesFromMilliseconds(milliseconds: number | undefined): number | undefined {
  return milliseconds === undefined ? undefined : milliseconds / 60_000;
}

export function durationMillisecondsFromMinutes(minutes: number | undefined): number | undefined {
  return minutes === undefined ? undefined : Math.round(minutes * 60_000);
}

export function selectCell(content: string | undefined, color = "1"): AttributeViewCellInput {
  return {
    type: "select",
    text: null,
    mSelect: content ? [{ content, color }] : [],
  };
}

export function multiSelectCell(
  contents: readonly string[] | undefined,
  color = "1",
): AttributeViewCellInput {
  return {
    type: "mSelect",
    text: null,
    mSelect: (contents ?? []).map((content) => ({ content, color })),
  };
}

export function dateCell(content: number | undefined): AttributeViewCellInput {
  return {
    type: "date",
    text: null,
    date: content === undefined
      ? { isNotEmpty: false }
      : { content, isNotEmpty: true, isNotTime: false },
  };
}

export function relationCell(blockId: string | undefined): AttributeViewCellInput {
  return {
    type: "relation",
    text: null,
    relation: { blockIDs: blockId ? [blockId] : [] },
  };
}

export async function setAttributeViewCell(
  client: SiyuanKernelClient,
  avID: string,
  keyID: string,
  itemID: string,
  value: AttributeViewCellInput,
): Promise<void> {
  await client.request("/api/av/setAttributeViewBlockAttr", { avID, keyID, itemID, value });
}
