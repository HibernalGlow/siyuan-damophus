import { readFileSync } from "node:fs";
import {
  confirmQuestionBankInitialization,
  previewQuestionBankInitialization,
} from "./binding";
import type { QuestionBankBinding } from "./binding";
import type {
  AttributeViewKeyValues,
  AttributeViewValue,
  NodeIdGenerator,
  RawAttributeView,
  SiyuanKernelClient,
} from "./types";

interface RequestRecord {
  endpoint: string;
  payload: any;
}

export function idGenerator(start = 0): NodeIdGenerator {
  let value = start;
  return () => `2026080412${String(value++).padStart(4, "0")}-${value.toString(36).padStart(7, "0").slice(-7)}`;
}

export class MockKernelClient implements SiyuanKernelClient {
  readonly requests: RequestRecord[] = [];
  readonly documents = new Map<string, string>();
  readonly blockRoots = new Map<string, string>();
  readonly blockAttrs = new Map<string, Record<string, string>>();
  readonly attributeViews = new Map<string, RawAttributeView>();
  private primaryIndex = 0;
  private rowIndex = 0;
  failNextCellWrite = false;
  failNextKeyWrite = false;

  async request<T>(endpoint: string, payload: any): Promise<T> {
    this.requests.push({ endpoint, payload });
    if (endpoint === "/api/filetree/createDocWithMd") {
      const documentId = "20260804130000-system1";
      this.documents.set(documentId, payload.markdown);
      return documentId as T;
    }
    if (endpoint === "/api/filetree/getIDsByHPath") return [] as T;
    if (endpoint === "/api/filetree/removeDocByID") {
      this.documents.delete(payload.id);
      return null as T;
    }
    if (endpoint === "/api/block/getBlockKramdown") {
      const kramdown = this.documents.get(payload.id);
      if (kramdown === undefined) throw new Error(`Block not found: ${payload.id}`);
      return { id: payload.id, kramdown } as T;
    }
    if (endpoint === "/api/query/sql") {
      const ids = [...String(payload.stmt).matchAll(/'(\d{14}-[a-z0-9]{7})'/gu)]
        .map((match) => match[1]);
      return ids.flatMap((id) => {
        const root = this.blockRoots.get(id);
        return root ? [{ id, root_id: root }] : [];
      }) as T;
    }
    if (endpoint === "/api/attr/setBlockAttrs") {
      this.blockAttrs.set(payload.id, {
        ...(this.blockAttrs.get(payload.id) ?? {}),
        ...payload.attrs,
      });
      return null as T;
    }
    if (endpoint === "/api/attr/getBlockAttrs") {
      return (this.blockAttrs.get(payload.id) ?? {}) as T;
    }
    if (endpoint === "/api/av/renderAttributeView") {
      if (!this.attributeViews.has(payload.id)) {
        const primaryId = `2026080413100${this.primaryIndex}-primary`;
        this.primaryIndex += 1;
        this.attributeViews.set(payload.id, {
          id: payload.id,
          keyValues: [{ key: { id: primaryId, name: "Primary", type: "block" }, values: [] }],
        });
      }
      return { id: payload.id, viewID: "view" } as T;
    }
    if (endpoint === "/api/av/getAttributeView") {
      const av = this.attributeViews.get(payload.id);
      if (!av) throw new Error(`AV not found: ${payload.id}`);
      return { av } as T;
    }
    if (endpoint === "/api/av/addAttributeViewKey") {
      if (this.failNextKeyWrite) {
        this.failNextKeyWrite = false;
        throw new Error("key write failed");
      }
      const av = this.requireAv(payload.avID);
      av.keyValues.push({
        key: { id: payload.keyID, name: payload.keyName, type: payload.keyType },
        values: [],
      });
      return null as T;
    }
    if (endpoint === "/api/transactions") {
      for (const transaction of payload.transactions) {
        for (const operation of transaction.doOperations) {
          const av = this.requireAv(operation.avID);
          const key = av.keyValues.find((value) => value.key.id === operation.keyID)?.key;
          if (operation.action === "updateAttrViewColRelation") {
            if (!key) throw new Error(`Key not found: ${operation.keyID}`);
            key.name = operation.format;
            key.relation = {
              avID: operation.id,
              backKeyID: operation.isTwoWay ? operation.backRelationKeyID : "",
              isTwoWay: operation.isTwoWay,
            };
            if (operation.isTwoWay) {
              const destination = this.requireAv(operation.id);
              const backKeyValues = destination.keyValues.find(
                (value) => value.key.id === operation.backRelationKeyID,
              );
              if (!backKeyValues) throw new Error(`Back key not found: ${operation.backRelationKeyID}`);
              backKeyValues.key.name = operation.name;
              backKeyValues.key.type = "relation";
              backKeyValues.key.relation = {
                avID: operation.avID,
                backKeyID: operation.keyID,
                isTwoWay: true,
              };
              const sourceValues = av.keyValues.find(
                (value) => value.key.id === operation.keyID,
              )?.values ?? [];
              for (const sourceValue of sourceValues) {
                for (const destinationId of sourceValue.relation?.blockIDs ?? []) {
                  const back = backKeyValues.values.find((value) => value.blockID === destinationId) ?? {
                    keyID: backKeyValues.key.id,
                    blockID: destinationId,
                    type: "relation" as const,
                    relation: { blockIDs: [] },
                  };
                  back.relation!.blockIDs = [...new Set([...back.relation!.blockIDs, sourceValue.blockID])];
                  if (!backKeyValues.values.includes(back)) backKeyValues.values.push(back);
                }
              }
            }
          } else if (operation.action === "updateAttrViewColRollup") {
            const rollupKey = av.keyValues.find((value) => value.key.id === operation.id)?.key;
            if (!rollupKey) throw new Error(`Rollup key not found: ${operation.id}`);
            rollupKey.rollup = {
              relationKeyID: operation.parentID,
              keyID: operation.keyID,
              calc: operation.data.calc,
            };
          } else if (operation.action === "updateAttrViewCol") {
            const updatedKey = av.keyValues.find((value) => value.key.id === operation.id)?.key;
            if (!updatedKey) throw new Error(`Key not found: ${operation.id}`);
            updatedKey.name = operation.name;
            updatedKey.type = operation.type;
            const values = av.keyValues.find((value) => value.key.id === operation.id)!.values;
            for (const value of values) value.type = operation.type;
          }
        }
      }
      return [{}] as T;
    }
    if (endpoint === "/api/av/addAttributeViewBlocks") {
      const av = this.requireAv(payload.avID);
      const primary = av.keyValues.find((value) => value.key.type === "block")!;
      for (const source of payload.srcs) {
        const itemID = source.itemID
          ?? `20260805150000-row${String(this.rowIndex++).padStart(4, "0")}`;
        if (primary.values.some((value) => value.blockID === itemID)) continue;
        if (!source.isDetached && primary.values.some((value) => value.block?.id === source.id)) continue;
        primary.values.push({
          keyID: primary.key.id,
          blockID: itemID,
          type: "block",
          isDetached: source.isDetached,
          block: { id: source.isDetached ? undefined : source.id, content: source.content },
        });
      }
      return null as T;
    }
    if (endpoint === "/api/av/getAttributeViewItemIDsByBoundIDs") {
      const av = this.requireAv(payload.avID);
      const primary = av.keyValues.find((value) => value.key.type === "block")!;
      return Object.fromEntries(payload.blockIDs.map((blockID: string) => [
        blockID,
        primary.values.find((value) => value.block?.id === blockID)?.blockID ?? "",
      ])) as T;
    }
    if (endpoint === "/api/av/setAttributeViewBlockAttr") {
      if (this.failNextCellWrite) {
        this.failNextCellWrite = false;
        throw new Error("cell write failed");
      }
      const av = this.requireAv(payload.avID);
      const primary = av.keyValues.find((value) => value.key.type === "block")!;
      if (!primary.values.some((value) => value.blockID === payload.itemID)) {
        throw new Error(`Row not found: ${payload.itemID}`);
      }
      const keyValues = av.keyValues.find((value) => value.key.id === payload.keyID);
      if (!keyValues) throw new Error(`Key not found: ${payload.keyID}`);
      const value: AttributeViewValue = keyValues.values.find(
        (item) => item.blockID === payload.itemID,
      ) ?? {
        keyID: payload.keyID,
        blockID: payload.itemID,
        type: payload.value.type,
      };
      const nextValue = { ...payload.value };
      if (["select", "mSelect"].includes(keyValues.key.type) && Array.isArray(payload.value.mSelect)) {
        const options = keyValues.key.options ??= [];
        nextValue.mSelect = payload.value.mSelect.map((item: { content: string; color: string }) => {
          const existing = options.find((option) => option.name === item.content);
          if (existing) return { ...item, color: existing.color };
          options.push({ name: item.content, color: item.color });
          return { ...item };
        });
      }
      const previousRelationIds = value.relation?.blockIDs ?? [];
      Object.assign(value, nextValue);
      if (!keyValues.values.includes(value)) keyValues.values.push(value);
      if (keyValues.key.type === "relation" && keyValues.key.relation?.isTwoWay) {
        const destination = this.requireAv(keyValues.key.relation.avID!);
        const backValues = destination.keyValues.find(
          (item) => item.key.id === keyValues.key.relation!.backKeyID,
        )!;
        for (const destinationId of previousRelationIds) {
          const back = backValues.values.find((item) => item.blockID === destinationId);
          if (back?.relation) back.relation.blockIDs = back.relation.blockIDs.filter(
            (id) => id !== payload.itemID,
          );
        }
        for (const destinationId of payload.value.relation?.blockIDs ?? []) {
          let back = backValues.values.find((item) => item.blockID === destinationId);
          if (!back) {
            back = {
              keyID: backValues.key.id,
              blockID: destinationId,
              type: "relation",
              relation: { blockIDs: [] },
            };
            backValues.values.push(back);
          }
          back.relation!.blockIDs = [...new Set([...back.relation!.blockIDs, payload.itemID])];
        }
      }
      return { value } as T;
    }
    if (endpoint === "/api/av/removeAttributeViewBlocks") {
      const av = this.requireAv(payload.avID);
      for (const keyValues of av.keyValues) {
        keyValues.values = keyValues.values.filter((value) => !payload.srcIDs.includes(value.blockID));
      }
      return null as T;
    }
    throw new Error(`Unhandled endpoint: ${endpoint}`);
  }

  private requireAv(id: string): RawAttributeView {
    const av = this.attributeViews.get(id);
    if (!av) throw new Error(`AV not found: ${id}`);
    return av;
  }
}

export async function initialized(): Promise<{
  client: MockKernelClient;
  binding: QuestionBankBinding;
  nextId: NodeIdGenerator;
}> {
  const client = new MockKernelClient();
  const nextId = idGenerator();
  const preview = previewQuestionBankInitialization({
    notebookId: "20260804120000-notebok",
    path: "/Damophus",
    idGenerator: nextId,
  });
  const binding = await confirmQuestionBankInitialization(client, preview, preview.token);
  return { client, binding, nextId };
}

export function fixture(name: string): string {
  return readFileSync(new URL(`../../fixtures/${name}.md`, import.meta.url), "utf8");
}

export function addCustomColumn(av: RawAttributeView): AttributeViewKeyValues {
  const custom: AttributeViewKeyValues = {
    key: { id: "20260804140000-custom1", name: "My Notes", type: "text" },
    values: [],
  };
  av.keyValues.splice(1, 0, custom);
  return custom;
}

export function questionAvRowId(
  client: MockKernelClient,
  binding: QuestionBankBinding,
  sourceBlockId: string,
): string {
  const rowId = client.attributeViews.get(binding.questionIndex.avId)?.keyValues.find(
    (keyValues) => keyValues.key.id === binding.questionIndex.keys.block_id,
  )?.values.find((value) => value.block?.id === sourceBlockId)?.blockID;
  if (!rowId) throw new Error(`Question row not found for ${sourceBlockId}`);
  return rowId;
}
