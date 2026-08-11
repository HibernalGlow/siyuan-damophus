export const topicSubjectIds = [
  "civil",
  "criminal",
  "civil-procedure",
  "criminal-procedure",
  "administrative",
  "commercial-economic",
  "theory-law",
  "international-law",
] as const;

export type TopicSubjectId = typeof topicSubjectIds[number];

interface TopicSubjectDefinition {
  id: TopicSubjectId;
  topicPrefixes: readonly string[];
}

const topicSubjectDefinitions: readonly TopicSubjectDefinition[] = [
  {id: "civil", topicPrefixes: ["civil-law", "civil"]},
  {id: "criminal", topicPrefixes: ["criminal-law", "criminal"]},
  {id: "civil-procedure", topicPrefixes: ["civil-procedure"]},
  {id: "criminal-procedure", topicPrefixes: ["criminal-procedure"]},
  {id: "administrative", topicPrefixes: ["administrative-law", "administrative"]},
  {
    id: "commercial-economic",
    topicPrefixes: [
      "commercial-economic-law",
      "commercial-law",
      "economic-law",
      "intellectual-property-law",
      "labor-social-security-law",
      "environmental-resource-law",
      "environmental-resources-law",
    ],
  },
  {
    id: "theory-law",
    topicPrefixes: [
      "theory-law",
      "jurisprudence",
      "constitutional-law",
      "chinese-legal-history",
      "judicial-system-legal-ethics",
    ],
  },
  {
    id: "international-law",
    topicPrefixes: [
      "international-law",
      "international-public-law",
      "international-private-law",
      "international-economic-law",
    ],
  },
];

const subjectPrefixIndex = topicSubjectDefinitions
  .flatMap(({id, topicPrefixes}) => topicPrefixes.map((prefix) => ({id, prefix})))
  .sort((left, right) => right.prefix.length - left.prefix.length);

export function inferTopicSubjectId(topicId: string): TopicSubjectId | undefined {
  const normalized = topicId.trim().toLowerCase();
  return subjectPrefixIndex.find(({prefix}) => (
    normalized === prefix || normalized.startsWith(`${prefix}-`)
  ))?.id;
}
