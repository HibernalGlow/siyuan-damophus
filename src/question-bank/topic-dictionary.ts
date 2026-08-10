import { z } from "zod";

export const TOPIC_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;

export const TOPIC_DICTIONARY_FORMAT_VERSION = 1;

export type TopicDictionaryEntryState = "present" | "retired";

export interface TopicDictionaryEntry {
  topicId: string;
  displayName: string;
  suggestedName: string;
  subjects: string[];
  categories: string[];
  collections: string[];
  sources: string[];
  state: TopicDictionaryEntryState;
  firstSeenAt: string;
  lastSeenAt?: string;
}

export interface TopicDictionaryDocument {
  formatVersion: typeof TOPIC_DICTIONARY_FORMAT_VERSION;
  revision: number;
  updatedAt: string;
  entries: Record<string, TopicDictionaryEntry>;
}

export interface TopicDictionaryCandidate {
  topicId: string;
  suggestedName?: string;
  subjects?: readonly string[];
  categories?: readonly string[];
  collections?: readonly string[];
  sources?: readonly string[];
}

export function parseTopicIds(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return [...new Set(value.split(",").map((item) => item.trim().toLowerCase()))]
    .filter((topicId) => TOPIC_ID_PATTERN.test(topicId));
}

const TopicDictionaryEntrySchema = z.object({
  topicId: z.string().regex(TOPIC_ID_PATTERN),
  displayName: z.string(),
  suggestedName: z.string(),
  subjects: z.array(z.string()),
  categories: z.array(z.string()),
  collections: z.array(z.string()),
  sources: z.array(z.string()),
  state: z.enum(["present", "retired"]),
  firstSeenAt: z.string(),
  lastSeenAt: z.string().optional(),
});

const TopicDictionaryDocumentSchema = z.object({
  formatVersion: z.literal(TOPIC_DICTIONARY_FORMAT_VERSION),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string(),
  entries: z.record(z.string(), TopicDictionaryEntrySchema),
});

export function emptyTopicDictionary(now = new Date().toISOString()): TopicDictionaryDocument {
  return {
    formatVersion: TOPIC_DICTIONARY_FORMAT_VERSION,
    revision: 0,
    updatedAt: now,
    entries: {},
  };
}

export function parseTopicDictionary(value: unknown): TopicDictionaryDocument {
  const parsed = TopicDictionaryDocumentSchema.parse(value);
  const entries: Record<string, TopicDictionaryEntry> = {};
  for (const [key, entry] of Object.entries(parsed.entries)) {
    const topicId = key.trim().toLowerCase();
    if (!TOPIC_ID_PATTERN.test(topicId) || topicId !== entry.topicId) {
      throw new Error(`Topic dictionary key does not match topicId: ${key}`);
    }
    entries[topicId] = {
      ...entry,
      topicId,
      displayName: entry.displayName.trim(),
      suggestedName: entry.suggestedName.trim(),
      subjects: uniqueLabels(entry.subjects),
      categories: uniqueLabels(entry.categories),
      collections: uniqueLabels(entry.collections),
      sources: uniqueLabels(entry.sources),
    };
  }
  return {...parsed, entries};
}

export function serializeTopicDictionary(document: TopicDictionaryDocument): string {
  return JSON.stringify(parseTopicDictionary(document), null, 2);
}

export function resolveTopicDictionaryLabel(
  dictionary: TopicDictionaryDocument,
  topicId: string,
  fallback: string,
): string {
  const normalized = topicId.trim().toLowerCase();
  const displayName = dictionary.entries[normalized]?.displayName.trim();
  return displayName || fallback || normalized;
}

export function mergeTopicDictionaryScan(
  current: TopicDictionaryDocument,
  candidates: readonly TopicDictionaryCandidate[],
  now = new Date().toISOString(),
): TopicDictionaryDocument {
  const nextEntries: Record<string, TopicDictionaryEntry> = {};
  const candidateMap = new Map<string, TopicDictionaryCandidate>();
  for (const candidate of candidates) {
    const topicId = candidate.topicId.trim().toLowerCase();
    if (!TOPIC_ID_PATTERN.test(topicId)) continue;
    const previous = candidateMap.get(topicId);
    candidateMap.set(topicId, {
      topicId,
      suggestedName: previous?.suggestedName || candidate.suggestedName?.trim() || undefined,
      subjects: uniqueLabels([...(previous?.subjects ?? []), ...(candidate.subjects ?? [])]),
      categories: uniqueLabels([...(previous?.categories ?? []), ...(candidate.categories ?? [])]),
      collections: uniqueLabels([...(previous?.collections ?? []), ...(candidate.collections ?? [])]),
      sources: uniqueLabels([...(previous?.sources ?? []), ...(candidate.sources ?? [])]),
    });
  }

  for (const [topicId, candidate] of candidateMap) {
    const previous = current.entries[topicId];
    nextEntries[topicId] = {
      topicId,
      displayName: previous?.displayName ?? "",
      suggestedName: candidate.suggestedName || previous?.suggestedName || "",
      subjects: [...(candidate.subjects ?? [])],
      categories: [...(candidate.categories ?? [])],
      collections: [...(candidate.collections ?? [])],
      sources: [...(candidate.sources ?? [])],
      state: "present",
      firstSeenAt: previous?.firstSeenAt ?? now,
      lastSeenAt: now,
    };
  }

  for (const [topicId, previous] of Object.entries(current.entries)) {
    if (nextEntries[topicId]) continue;
    nextEntries[topicId] = {...previous, state: "retired"};
  }

  return {
    formatVersion: TOPIC_DICTIONARY_FORMAT_VERSION,
    revision: current.revision + 1,
    updatedAt: now,
    entries: nextEntries,
  };
}

export function updateTopicDictionaryLabel(
  current: TopicDictionaryDocument,
  topicId: string,
  displayName: string,
  now = new Date().toISOString(),
): TopicDictionaryDocument {
  const normalized = topicId.trim().toLowerCase();
  if (!TOPIC_ID_PATTERN.test(normalized)) throw new Error(`Invalid topic ID: ${topicId}`);
  const previous = current.entries[normalized] ?? {
    topicId: normalized,
    displayName: "",
    suggestedName: "",
    subjects: [],
    categories: [],
    collections: [],
    sources: [],
    state: "retired" as const,
    firstSeenAt: now,
  };
  return {
    ...current,
    revision: current.revision + 1,
    updatedAt: now,
    entries: {
      ...current.entries,
      [normalized]: {...previous, displayName: displayName.trim()},
    },
  };
}

export function updateTopicDictionaryLabels(
  current: TopicDictionaryDocument,
  labels: Readonly<Record<string, string>>,
  now = new Date().toISOString(),
): TopicDictionaryDocument {
  let entries = current.entries;
  let changed = false;
  for (const [rawTopicId, rawDisplayName] of Object.entries(labels)) {
    const topicId = rawTopicId.trim().toLowerCase();
    if (!TOPIC_ID_PATTERN.test(topicId)) throw new Error(`Invalid topic ID: ${rawTopicId}`);
    const displayName = rawDisplayName.trim();
    const previous = entries[topicId];
    if (previous?.displayName === displayName) continue;
    const next = updateTopicDictionaryLabel({...current, entries}, topicId, displayName, now);
    entries = next.entries;
    changed = true;
  }
  return changed ? {
    ...current,
    revision: current.revision + 1,
    updatedAt: now,
    entries,
  } : current;
}

export function uniqueLabels(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => (
    left.localeCompare(right, "zh-CN", {numeric: true, sensitivity: "base"})
  ));
}
