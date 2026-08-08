import { describe, expect, it, vi } from "vitest";
import type { StoreFileIO } from "../question-bank/adapters/tinybase/file-persistence";
import { TinyBaseWarehouse } from "../question-bank/adapters/tinybase/warehouse";
import type { SiyuanKernelClient } from "../question-bank/adapters/siyuan/types";
import { TinyBaseRuntime } from "./tinybase-runtime";
import { TinyBaseSiyuanCatalogRuntime } from "./tinybase-catalog-runtime";

class MemoryFiles implements StoreFileIO {
  readonly files = new Map<string, string>();
  async read(path: string): Promise<string | undefined> { return this.files.get(path); }
  async write(path: string, content: string): Promise<void> { this.files.set(path, content); }
  async list(path: string): Promise<string[]> { return [...this.files.keys()].filter((item) => item.startsWith(path)); }
}

const documentId = "20260808000000-doc0001";
const questionBlockId = "20260808000001-quest01";
const topicBlockId = "20260808000002-topic01";
const markdown = `## 合同效力
{: id="${topicBlockId}" custom-qb-note-topic-id="contract-validity"}

##### 1. 单选
{: id="${questionBlockId}" custom-qb-id="q-contract-1" custom-qb-type="single" custom-qb-answer="A" custom-qb-year="2026" custom-qb-subject="civil" custom-qb-category="contract" custom-qb-collection="law" custom-qb-source="mock"}

- [ ] A. 有效
- [ ] B. 无效

答案：A。
{: custom-qb-section="solution"}

解析：题目答案为 A。`;

const legacyMetadataMarkdown = markdown
  .replace('custom-qb-id="q-contract-1"', 'custom-qb-id="civil-procedure-gold-2025-2-4-18"')
  .replace(' custom-qb-year="2026" custom-qb-subject="civil" custom-qb-category="contract" custom-qb-collection="law" custom-qb-source="mock"', ' custom-qb-subject="civil" custom-qb-category="contract"');

function client(kramdown = markdown): SiyuanKernelClient {
  return {
    request: vi.fn(async <T,>(endpoint: string, payload: {stmt?: string; id?: string}) => {
      if (endpoint === "/api/block/getBlockKramdown") return {id: payload.id, kramdown} as T;
      if (endpoint === "/api/query/sql" && payload.stmt?.includes("type = 'd'")) {
        return [{id: documentId, box: "notebook-1", content: "合同题", hpath: "/合同题", updated: "2026-08-08T00:00:00Z"}] as T;
      }
      if (endpoint === "/api/query/sql" && payload.stmt?.includes("DISTINCT root_id")) {
        return [{root_id: documentId}] as T;
      }
      if (endpoint === "/api/query/sql") {
        return [{id: documentId, box: "notebook-1", content: "合同题", hpath: "/合同题", updated: "2026-08-08T00:00:00Z"}] as T;
      }
      return undefined as T;
    }),
  } as SiyuanKernelClient;
}

describe("TinyBase SiYuan catalog runtime", () => {
  it("previews and confirms a document into TinyBase without AV writes", async () => {
    const files = new MemoryFiles();
    const kernel = client();
    const attrWrites: unknown[] = [];
    (kernel.request as ReturnType<typeof vi.fn>).mockImplementation(async <T,>(endpoint: string, payload: any) => {
      if (endpoint === "/api/attr/setBlockAttrs") {
        attrWrites.push(payload);
        return undefined as T;
      }
      if (endpoint === "/api/block/getBlockKramdown") return {id: payload.id, kramdown: markdown} as T;
      if (endpoint === "/api/query/sql" && payload.stmt?.includes("DISTINCT root_id")) return [{root_id: documentId}] as T;
      if (endpoint === "/api/query/sql") return [{id: documentId, box: "notebook-1", content: "合同题", hpath: "/合同题", updated: "2026-08-08T00:00:00Z"}] as T;
      return undefined as T;
    });
    const catalog = new TinyBaseSiyuanCatalogRuntime(
      new TinyBaseRuntime(new TinyBaseWarehouse(files, "device-a")),
      kernel,
    );

    const preview = await catalog.previewDocument(documentId);
    expect(preview.blockers).toEqual([]);
    expect(preview.actions.map((action) => action.question.id)).toEqual(["q-contract-1"]);
    await expect(catalog.confirmDocument(documentId, preview.token)).resolves.toMatchObject({
      results: [{questionId: "q-contract-1", status: "synced"}],
    });
    expect(attrWrites).toEqual([]);
    expect((await catalog.loadCatalog()).map((entry) => entry.questionId)).toEqual(["q-contract-1"]);
  });

  it("derives report metadata from stable legacy question IDs", async () => {
    const warehouse = new TinyBaseWarehouse(new MemoryFiles(), "device-a");
    const catalog = new TinyBaseSiyuanCatalogRuntime(
      new TinyBaseRuntime(warehouse),
      client(legacyMetadataMarkdown),
    );

    const preview = await catalog.previewDocument(documentId);
    await catalog.confirmDocument(documentId, preview.token);
    for (const field of ["year", "collection", "source"] as const) {
      warehouse.getLocalContribution().core.setCell(
        "questions",
        "civil-procedure-gold-2025-2-4-18",
        field,
        "",
      );
    }

    await expect(catalog.loadStatisticsQuestions()).resolves.toEqual([
      expect.objectContaining({
        questionId: "civil-procedure-gold-2025-2-4-18",
        year: "2025",
        collection: "gold",
        source: "gold",
      }),
    ]);
  });
});
