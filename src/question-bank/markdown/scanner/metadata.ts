import type { IalAttributes } from "../ial";
import { inferTopicSubjectId, resolveTopicSubjectId } from "../../topic-subjects";
import type { QuestionMetadata } from "../../core/types";
import { stableTopicIdPattern } from "./markdown";
import type { TopicState } from "./types";

export function inheritedMetadata(attributes: IalAttributes): TopicState["metadata"] {
  return {
    year: attributes["custom-qb-year"],
    subject: attributes["custom-qb-subject"],
    category: attributes["custom-qb-category"],
    collection: attributes["custom-qb-collection"],
    source: attributes["custom-qb-source"],
  };
}

export function mergeDefined<T extends object>(base: T, patch: Partial<T>): T {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) Object.assign(result, { [key]: value });
  }
  return result;
}

export function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function inferredTopicId(path: readonly string[], sourceLine: number | undefined): string {
  return `inferred-${stableHash(`${path.join("\u001f")}\u001f${sourceLine ?? "unknown"}`)}`;
}

export function portableTopicIds(attributes: IalAttributes): {
  ids: string[];
  invalid: string[];
  duplicates: string[];
  legacy: boolean;
  conflictingSources: boolean;
} {
  const source = attributes["custom-qb-question-topic-ids"] ?? attributes["custom-qb-topic-ids"];
  if (!source) return { ids: [], invalid: [], duplicates: [], legacy: false, conflictingSources: false };
  const values = source.split(/[,，\s]+/u).map((value) => value.trim()).filter(Boolean);
  const invalid = values.filter((value) => !stableTopicIdPattern.test(value));
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  const modern = attributes["custom-qb-question-topic-ids"];
  const legacy = attributes["custom-qb-topic-ids"];
  const normalize = (value: string): string => value.split(/[,，\s]+/u).filter(Boolean).join(",");
  return {
    ids: [...new Set(values)],
    invalid,
    duplicates: [...new Set(duplicates)],
    legacy: legacy !== undefined,
    conflictingSources: modern !== undefined && legacy !== undefined && normalize(modern) !== normalize(legacy),
  };
}

export function metadataForQuestion(
  topics: readonly TopicState[],
  attributes: IalAttributes,
  topicIds: readonly string[],
): QuestionMetadata {
  const inherited = topics.reduce<TopicState["metadata"]>(
    (metadata, topic) => mergeDefined(metadata, topic.metadata),
    {},
  );
  const own = inheritedMetadata(attributes);
  const closestTopic = topics.at(-1);
  const closestStableTopic = [...topics].reverse().find((topic) => topic.node.explicit);
  const primaryTopicId = topicIds[0] ?? closestStableTopic?.node.id ?? closestTopic?.node.id;
  const inferredSubject = primaryTopicId ? inferTopicSubjectId(primaryTopicId) : undefined;
  const rawCategory = own.category ?? inherited.category;
  const resolvedCategory = (rawCategory && rawCategory !== "gold") ? rawCategory : (rawCategory ?? primaryTopicId);
  const rawSubject = own.subject ?? inherited.subject;
  const trimmedSubject = rawSubject?.trim();
  const canonicalSubject = trimmedSubject ? (resolveTopicSubjectId(trimmedSubject) ?? trimmedSubject) : undefined;
  const resolvedSubject = canonicalSubject ?? inferredSubject;
  return {
    ...mergeDefined(inherited, own),
    category: resolvedCategory,
    subject: resolvedSubject,
    topicId: closestStableTopic?.node.id,
    topicIds: topicIds.length > 0 ? [...topicIds] : undefined,
    scopeTopicId: closestTopic?.node.id,
    topicPath: topics.map((topic) => topic.node.title),
    parentId: attributes["custom-qb-parent-id"],
  };
}
