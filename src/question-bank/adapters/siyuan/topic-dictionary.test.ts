import { describe, expect, it } from "vitest";
import type { StoreFileIO } from "../tinybase/file-persistence";
import {
  TOPIC_DICTIONARY_PATH,
  TopicDictionaryStore,
  buildTopicDictionarySql,
  candidatesFromRows,
} from "./topic-dictionary";

class MemoryFiles implements StoreFileIO {
  readonly files = new Map<string, string>();
  async read(path: string): Promise<string | undefined> { return this.files.get(path); }
  async write(path: string, content: string): Promise<void> { this.files.set(path, content); }
  async list(): Promise<string[]> { return []; }
}

describe("SiYuan topic dictionary", () => {
  it("discovers IDs and classification attributes without treating question titles as labels", () => {
    const candidates = candidatesFromRows([
      {
        block_id: "20260810000100-question",
        attribute_name: "custom-qb-question-topic-ids",
        attribute_value: "civil-contract-validity,criminal-causation",
        block_content: "108.",
        subject: "民法",
        category: "合同",
      },
      {
        block_id: "20260810000100-anchor01",
        attribute_name: "custom-qb-note-topic-id",
        attribute_value: "civil-contract-validity",
        block_content: "合同效力",
        subject: "民法",
      },
    ]);

    expect(candidates).toEqual([
      expect.objectContaining({
        topicId: "civil-contract-validity",
        suggestedName: "合同效力",
        subjects: ["民法"],
        categories: ["合同"],
      }),
      expect.objectContaining({
        topicId: "criminal-causation",
        suggestedName: undefined,
      }),
    ]);
    expect(buildTopicDictionarySql()).toContain("custom-qb-subject");
    expect(buildTopicDictionarySql()).toContain("custom-qb-question-topic-ids");
  });

  it("writes one shared dictionary file and keeps removed topics", async () => {
    const files = new MemoryFiles();
    let rows = [{
      block_id: "20260810000100-question",
      attribute_name: "custom-qb-question-topic-ids",
      attribute_value: "civil-contract-validity",
      block_content: "108.",
      subject: "民法",
    }];
    const store = new TopicDictionaryStore(files, {
      request: async () => rows as any,
    }, () => new Date("2026-08-10T10:00:00.000Z"));

    await store.scan();
    await store.saveLabels({"civil-contract-validity": "合同效力"});
    rows = [];
    const result = await store.scan();

    expect([...files.files.keys()]).toEqual([TOPIC_DICTIONARY_PATH]);
    expect(result.document.entries["civil-contract-validity"]).toMatchObject({
      displayName: "合同效力",
      state: "retired",
    });
  });

  it("serializes scans and label saves so concurrent actions do not lose names", async () => {
    const files = new MemoryFiles();
    const rows = [{
      block_id: "20260810000100-question",
      attribute_name: "custom-qb-question-topic-ids",
      attribute_value: "civil-contract-validity",
      block_content: "108.",
      subject: "民法",
    }];
    const store = new TopicDictionaryStore(files, {
      request: async () => rows as any,
    }, () => new Date("2026-08-10T10:00:00.000Z"));

    await store.scan();
    const [scanResult, saved] = await Promise.all([
      store.scan(),
      store.saveLabels({"civil-contract-validity": "合同效力"}),
    ]);

    expect(scanResult.document.entries["civil-contract-validity"].state).toBe("present");
    expect(saved.entries["civil-contract-validity"].displayName).toBe("合同效力");
    await expect(store.load()).resolves.toMatchObject({
      entries: {
        "civil-contract-validity": expect.objectContaining({displayName: "合同效力"}),
      },
    });
  });
});
