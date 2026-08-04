import type { AttributeViewKeyType, SiyuanKernelClient } from "./types";

export interface AttributeViewCellInput {
  type: AttributeViewKeyType;
  text?: { content: string };
  number?: { content?: number; isNotEmpty: boolean };
  date?: { content?: number; isNotEmpty: boolean; isNotTime?: boolean };
}

export function textCell(content: string | undefined): AttributeViewCellInput {
  return { type: "text", text: { content: content ?? "" } };
}

export function numberCell(content: number | undefined): AttributeViewCellInput {
  return {
    type: "number",
    number: content === undefined ? { isNotEmpty: false } : { content, isNotEmpty: true },
  };
}

export function dateCell(content: number | undefined): AttributeViewCellInput {
  return {
    type: "date",
    date: content === undefined
      ? { isNotEmpty: false }
      : { content, isNotEmpty: true, isNotTime: false },
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
