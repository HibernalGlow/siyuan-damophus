import { describe, expect, it, vi } from "vitest";
import { scanSiyuanDocument } from "./document";
import type { SiyuanKernelClient } from "./types";

describe("SiYuan note-topic anchor binding", () => {
  it("maps an explicit paragraph anchor topic ID to its stable SiYuan block ID", async () => {
    const documentId = "20260807120000-docroot";
    const anchorId = "20260807120001-abcdefg";
    const client = {
      request: vi.fn(async (endpoint: string) => {
        if (endpoint === "/api/block/getBlockKramdown") {
          return {
            id: documentId,
            kramdown: `**考点：善意取得**
{: id="${anchorId}" custom-qb-note-topic-id="civil-property-good-faith-acquisition"}

普通笔记正文。`,
          };
        }
        throw new Error(`Unexpected endpoint: ${endpoint}`);
      }),
    } as unknown as SiyuanKernelClient;

    const scan = await scanSiyuanDocument(client, documentId);

    expect(scan.sourceIssues).toEqual([]);
    expect(scan.topicBlockIdsByTopicId.get("civil-property-good-faith-acquisition")).toBe(anchorId);
  });
});
