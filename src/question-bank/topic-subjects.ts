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
  {id: "administrative", topicPrefixes: ["administrative-law", "administrative", "admin-law", "admin"]},
  {
    id: "commercial-economic",
    topicPrefixes: [
      "commercial-economic-law",
      "commercial-law",
      "commercial",
      "economic-law",
      "economic",
      "intellectual-property-law",
      "labor-social-security-law",
      "environmental-resource-law",
      "environmental-resources-law",
      "company-law",
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
      "theory",
    ],
  },
  {
    id: "international-law",
    topicPrefixes: [
      "international-law",
      "international-public-law",
      "international-private-law",
      "international-economic-law",
      "intl-public",
      "intl-private",
      "intl-economic",
      "intl-law",
      "intl-space",
      "intl",
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

const subjectAliases: Readonly<Record<string, TopicSubjectId>> = {
  "民法": "civil",
  "刑法": "criminal",
  "民诉": "civil-procedure",
  "民诉法": "civil-procedure",
  "民事诉讼法": "civil-procedure",
  "刑诉": "criminal-procedure",
  "刑诉法": "criminal-procedure",
  "刑事诉讼法": "criminal-procedure",
  "行政法": "administrative",
  "商经知": "commercial-economic",
  "商经法": "commercial-economic",
  "商法": "commercial-economic",
  "经济法": "commercial-economic",
  "理论法": "theory-law",
  "三国法": "international-law",
  "国际法": "international-law",
  "国际公法": "international-law",
  "国际私法": "international-law",
  "国际经济法": "international-law",
};

/** Maps free-form subject metadata (e.g. "administrative law", "行政法") onto a canonical subject id. */
export function resolveTopicSubjectId(raw: string | undefined): TopicSubjectId | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value) return undefined;
  if ((topicSubjectIds as readonly string[]).includes(value)) return value as TopicSubjectId;
  const alias = subjectAliases[value];
  if (alias) return alias;
  return inferTopicSubjectId(value.replace(/[\s_]+/gu, "-"));
}

const questionIdKindTokens = new Set(["gold", "real", "simulated", "mock", "practice", "sample"]);

/** Infers the subject from a question ID such as "administrative-law-gold-2013-2-2". */
export function inferSubjectFromQuestionId(questionId: string): TopicSubjectId | undefined {
  const tokens = questionId.trim().toLowerCase().split("-").filter(Boolean);
  if (tokens.length === 0) return undefined;
  const yearIndex = tokens.findIndex((token) => /^(?:19|20)\d{2}$/u.test(token));
  const head = yearIndex > 0 ? tokens.slice(0, yearIndex) : tokens;
  let end = head.length;
  while (end > 0 && questionIdKindTokens.has(head[end - 1])) end -= 1;
  if (end === 0) return undefined;
  return inferTopicSubjectId(head.slice(0, end).join("-"));
}
