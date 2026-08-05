import type { SiyuanKernelClient } from "../question-bank/adapters/siyuan/types";

export interface SourceBlockIdentity {
  id: string;
  rootId: string;
  type: string;
  subtype?: string;
  content: string;
  hpath: string;
}

interface SourceBlockRow {
  id?: string;
  root_id?: string;
  type?: string;
  subtype?: string;
  content?: string;
  hpath?: string;
}

const nodeIdPattern = /^\d{14}-[a-z0-9]{7}$/u;

export async function loadSourceBlockIdentity(
  client: SiyuanKernelClient,
  blockId: string,
): Promise<SourceBlockIdentity> {
  if (!nodeIdPattern.test(blockId)) throw new Error("Invalid SiYuan block ID");
  const rows = await client.request<SourceBlockRow[]>("/api/query/sql", {
    stmt: `SELECT id, root_id, type, subtype, content, hpath FROM blocks WHERE id = '${blockId}' LIMIT 1`,
  });
  const row = rows[0];
  if (!row?.id) throw new Error(`Cannot resolve source block '${blockId}'`);
  return {
    id: row.id,
    rootId: row.root_id || row.id,
    type: row.type || "other",
    subtype: row.subtype || undefined,
    content: row.content?.trim() || row.hpath?.split("/").filter(Boolean).at(-1) || row.id,
    hpath: row.hpath || "",
  };
}
