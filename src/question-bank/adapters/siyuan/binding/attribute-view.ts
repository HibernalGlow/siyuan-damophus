import type {
  AttributeViewValue,
  RawAttributeView,
  SiyuanKernelClient,
} from "../types";
import { primaryKeyId } from "../binding-utils";
import type { PlannedColumn } from "../binding-schema";

export async function getAttributeView(client: SiyuanKernelClient, avId: string): Promise<RawAttributeView> {
  const response = await client.request<{ av: RawAttributeView }>("/api/av/getAttributeView", { id: avId });
  return response.av;
}

export async function initializeAttributeView<Field extends string>(
  client: SiyuanKernelClient,
  avId: string,
  blockId: string,
  primaryField: Field,
  columns: readonly PlannedColumn<Field>[],
): Promise<Record<Field, string>> {
  await client.request("/api/av/renderAttributeView", {
    id: avId,
    blockID: blockId,
    viewID: "",
    page: 1,
    pageSize: 1,
    query: "",
    groupPaging: {},
    createIfNotExist: true,
  });
  const av = await getAttributeView(client, avId);
  const keys = { [primaryField]: primaryKeyId(av) } as Record<Field, string>;
  let previousKeyID = keys[primaryField];
  for (const column of columns) {
    await client.request("/api/av/addAttributeViewKey", {
      avID: avId,
      keyID: column.keyId,
      keyName: column.name,
      keyType: column.type,
      keyIcon: "",
      previousKeyID,
    });
    keys[column.field as Field] = column.keyId;
    previousKeyID = column.keyId;
  }
  return keys;
}

export function valuesByItemId(av: RawAttributeView, keyId: string): Map<string, AttributeViewValue> {
  const values = av.keyValues.find((item) => item.key.id === keyId)?.values ?? [];
  return new Map(values.map((value) => [value.blockID, value]));
}

export function valueText(value: AttributeViewValue | undefined): string | undefined {
  return value?.mSelect?.[0]?.content ?? value?.text?.content;
}

export async function readAttributeView(
  client: SiyuanKernelClient,
  avId: string,
): Promise<RawAttributeView> {
  return getAttributeView(client, avId);
}
