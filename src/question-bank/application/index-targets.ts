import type { SiyuanKernelClient } from "../adapters/siyuan/types";

/**
 * fmisc-style registry: the projection target is stored as a block attribute on the
 * database block itself, so any database can be marked/unmarked/synced from its
 * context menu without opening the question bank workspace or retyping IDs.
 */
export const QUESTION_INDEX_ATTR = "custom-qb-question-index";

export interface QuestionIndexMark {
  avId?: string;
  pruneStale?: boolean;
  includeUnanswered?: boolean;
}

export interface QuestionIndexTargetRecord {
  blockId: string;
  mark: QuestionIndexMark;
}

export function parseQuestionIndexMark(value: string | undefined): QuestionIndexMark | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as QuestionIndexMark;
      }
    } catch {
      return {};
    }
  }
  return {};
}

export async function listQuestionIndexTargets(client: SiyuanKernelClient): Promise<QuestionIndexTargetRecord[]> {
  const rows = await client.request<Array<{ id?: string }>>("/api/query/sql", {
    stmt: `SELECT id FROM blocks WHERE ial LIKE '%${QUESTION_INDEX_ATTR}%'`,
  });
  const targets: QuestionIndexTargetRecord[] = [];
  for (const row of rows) {
    if (!row.id) continue;
    const attrs = await client.request<Record<string, string>>("/api/attr/getBlockAttrs", { id: row.id }).catch(() => ({}));
    const mark = parseQuestionIndexMark(attrs[QUESTION_INDEX_ATTR]);
    if (mark) targets.push({ blockId: row.id, mark });
  }
  return targets;
}

export async function markQuestionIndexTarget(
  client: SiyuanKernelClient,
  blockId: string,
  avId: string | undefined,
  options: QuestionIndexMark = {},
): Promise<void> {
  const payload: QuestionIndexMark = { ...options, avId: avId ?? "" };
  await client.request("/api/attr/setBlockAttrs", {
    id: blockId,
    attrs: { [QUESTION_INDEX_ATTR]: JSON.stringify(payload) },
  });
}

export async function unmarkQuestionIndexTarget(client: SiyuanKernelClient, blockId: string): Promise<void> {
  await client.request("/api/attr/setBlockAttrs", {
    id: blockId,
    attrs: { [QUESTION_INDEX_ATTR]: "" },
  });
}

export async function readQuestionIndexMark(
  client: SiyuanKernelClient,
  blockId: string,
): Promise<QuestionIndexMark | undefined> {
  const attrs = await client.request<Record<string, string>>("/api/attr/getBlockAttrs", { id: blockId }).catch(() => ({}));
  return parseQuestionIndexMark(attrs[QUESTION_INDEX_ATTR]);
}
