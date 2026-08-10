import {
  emptyTopicDictionary,
  mergeTopicDictionaryScan,
  parseTopicDictionary,
  serializeTopicDictionary,
  updateTopicDictionaryLabel,
  updateTopicDictionaryLabels,
  uniqueLabels,
  parseTopicIds,
  type TopicDictionaryCandidate,
  type TopicDictionaryDocument,
} from "../topic-dictionary";
import type { StoreFileIO } from "../tinybase/file-persistence";
import type { SiyuanKernelClient } from "./types";

export const TOPIC_DICTIONARY_PATH = "/data/storage/petal/siyuan-damophus/topic-dictionary.json";
export const TOPIC_DICTIONARY_UPDATED_EVENT = "damophus-topic-dictionary-updated";

export interface TopicDictionarySqlRow {
  block_id: string;
  attribute_name: string;
  attribute_value: string;
  block_content?: string;
  hpath?: string;
  subject?: string;
  category?: string;
  collection?: string;
  source?: string;
}

export interface TopicDictionaryScanResult {
  document: TopicDictionaryDocument;
  discoveredCount: number;
  presentCount: number;
  retiredCount: number;
  newTopicIds: string[];
}

export function buildTopicDictionarySql(): string {
  return `SELECT
  a.block_id,
  a.name AS attribute_name,
  a.value AS attribute_value,
  b.content AS block_content,
  b.hpath,
  COALESCE(subject.value, '') AS subject,
  COALESCE(category.value, '') AS category,
  COALESCE(collection.value, '') AS collection,
  COALESCE(source.value, '') AS source
FROM attributes a
JOIN blocks b ON b.id = a.block_id
LEFT JOIN attributes subject
  ON subject.block_id = a.block_id AND subject.name = 'custom-qb-subject'
LEFT JOIN attributes category
  ON category.block_id = a.block_id AND category.name = 'custom-qb-category'
LEFT JOIN attributes collection
  ON collection.block_id = a.block_id AND collection.name = 'custom-qb-collection'
LEFT JOIN attributes source
  ON source.block_id = a.block_id AND source.name = 'custom-qb-source'
WHERE a.name IN ('custom-qb-note-topic-id', 'custom-qb-question-topic-ids')
ORDER BY a.block_id`;
}

export function candidatesFromRows(rows: readonly TopicDictionarySqlRow[]): TopicDictionaryCandidate[] {
  const candidates = new Map<string, TopicDictionaryCandidate>();
  for (const row of rows) {
    const topicIds = parseTopicIds(row.attribute_value);
    const isNoteAnchor = row.attribute_name === "custom-qb-note-topic-id";
    for (const topicId of isNoteAnchor ? topicIds.slice(0, 1) : topicIds) {
      const previous = candidates.get(topicId);
      candidates.set(topicId, {
        topicId,
        // Only topic anchors can suggest a label. Question numbers are not labels.
        suggestedName: previous?.suggestedName || (isNoteAnchor ? row.block_content?.trim() : "") || undefined,
        subjects: uniqueLabels([...(previous?.subjects ?? []), row.subject ?? ""]),
        categories: uniqueLabels([...(previous?.categories ?? []), row.category ?? ""]),
        collections: uniqueLabels([...(previous?.collections ?? []), row.collection ?? ""]),
        sources: uniqueLabels([...(previous?.sources ?? []), row.source ?? ""]),
      });
    }
  }
  return [...candidates.values()].sort((left, right) => left.topicId.localeCompare(right.topicId));
}

export class TopicDictionaryStore {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly io: StoreFileIO,
    private readonly client: SiyuanKernelClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async load(): Promise<TopicDictionaryDocument> {
    const raw = await this.io.read(TOPIC_DICTIONARY_PATH);
    if (!raw) return emptyTopicDictionary(this.now().toISOString());
    try {
      return parseTopicDictionary(JSON.parse(raw));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.io.quarantine?.(TOPIC_DICTIONARY_PATH, raw, reason);
      throw new Error(`Topic dictionary is invalid: ${reason}`);
    }
  }

  async save(document: TopicDictionaryDocument): Promise<void> {
    const content = serializeTopicDictionary(document);
    this.writeChain = this.writeChain.then(() => this.io.write(TOPIC_DICTIONARY_PATH, content));
    await this.writeChain;
  }

  async scan(): Promise<TopicDictionaryScanResult> {
    const rows = await this.client.request<TopicDictionarySqlRow[]>("/api/query/sql", {
      stmt: buildTopicDictionarySql(),
    });
    const current = await this.load();
    const candidates = candidatesFromRows(rows);
    const next = mergeTopicDictionaryScan(current, candidates, this.now().toISOString());
    await this.save(next);
    const discovered = new Set(candidates.map((candidate) => candidate.topicId));
    const newTopicIds = candidates
      .map((candidate) => candidate.topicId)
      .filter((topicId) => !current.entries[topicId]);
    return {
      document: next,
      discoveredCount: discovered.size,
      presentCount: Object.values(next.entries).filter((entry) => entry.state === "present").length,
      retiredCount: Object.values(next.entries).filter((entry) => entry.state === "retired").length,
      newTopicIds,
    };
  }

  async saveLabel(topicId: string, displayName: string): Promise<TopicDictionaryDocument> {
    const current = await this.load();
    const next = updateTopicDictionaryLabel(current, topicId, displayName, this.now().toISOString());
    await this.save(next);
    return next;
  }

  async saveLabels(labels: Readonly<Record<string, string>>): Promise<TopicDictionaryDocument> {
    const current = await this.load();
    const next = updateTopicDictionaryLabels(current, labels, this.now().toISOString());
    if (next !== current) await this.save(next);
    return next;
  }
}
