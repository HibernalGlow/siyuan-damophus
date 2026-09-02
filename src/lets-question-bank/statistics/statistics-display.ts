import {
  Calendar,
  BarChart3,
  BookOpen,
  Briefcase,
  CheckSquare,
  FolderTree,
  Globe2,
  HeartHandshake,
  HelpCircle,
  Landmark,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
} from "lucide-svelte";
import { resolveTopicDictionaryClassificationLabel, type TopicDictionaryDocument } from "@/question-bank/topic-dictionary";
import type { StatisticsDimension, StatisticsRange } from "@/question-bank/core/statistics";

/** Display/i18n helpers for the statistics view; `label`/`translations` come from the component. */
export function createStatisticsDisplay(deps: {
  label: (key: string, fallback: string) => string;
  translations: Record<string, string>;
  topicDictionary: () => TopicDictionaryDocument | undefined;
}) {
  const { label, translations } = deps;

  function getSubjectIcon(subjectKey: string) {
    switch (subjectKey) {
      case "civil": return HeartHandshake;
      case "criminal": return ShieldAlert;
      case "civil-procedure": return ScrollText;
      case "criminal-procedure": return ShieldCheck;
      case "administrative": return Landmark;
      case "commercial-economic": return Briefcase;
      case "theory-law": return BookOpen;
      case "international-law": return Globe2;
      default: return HelpCircle;
    }
  }

  function getDimensionIcon(dim: StatisticsDimension) {
    switch (dim) {
      case "subject": return BookOpen;
      case "category": return FolderTree;
      case "year": return Calendar;
      case "question_type": return CheckSquare;
      default: return BarChart3;
    }
  }

  const subjectTranslationKeys: Readonly<Record<string, string>> = {
    civil: "lets-topic-dictionary.subjectCivil",
    criminal: "lets-topic-dictionary.subjectCriminal",
    "civil-procedure": "lets-topic-dictionary.subjectCivilProcedure",
    "criminal-procedure": "lets-topic-dictionary.subjectCriminalProcedure",
    administrative: "lets-topic-dictionary.subjectAdministrative",
    "commercial-economic": "lets-topic-dictionary.subjectCommercialEconomic",
    "theory-law": "lets-topic-dictionary.subjectTheoryLaw",
    "international-law": "lets-topic-dictionary.subjectInternationalLaw",
  };
  const defaultSubjectNames: Readonly<Record<string, string>> = {
    civil: "民法",
    criminal: "刑法",
    "civil-procedure": "民诉",
    "criminal-procedure": "刑诉",
    administrative: "行政法",
    "commercial-economic": "商经知",
    "theory-law": "理论法",
    "international-law": "三国法",
  };
  const questionTypeLabelKeys: Readonly<Record<string, string>> = {
    single: "questionTypeSingle",
    multiple: "questionTypeMultiple",
    indefinite: "questionTypeIndefinite",
    "true-false": "questionTypeTrueFalse",
    subjective: "questionTypeSubjective",
    group: "questionTypeGroup",
  };

  const ranges: Array<{ value: string; label: string }> = [
    { value: "7", label: label("statistics7Days", "7 days") },
    { value: "30", label: label("statistics30Days", "30 days") },
    { value: "90", label: label("statistics90Days", "90 days") },
    { value: "all", label: label("statisticsAll", "All") },
  ];
  const dimensions: Array<{ value: StatisticsDimension; label: string }> = [
    { value: "subject", label: label("statisticsSubject", "Subject") },
    { value: "category", label: label("statisticsCategory", "Category") },
    { value: "year", label: label("statisticsYear", "Year") },
    { value: "question_type", label: label("statisticsType", "Question type") },
  ];

  function fullscreenLabel(title: string): string {
    return `${label("statisticsFullscreenPreview", "Preview full screen")}: ${title}`;
  }

  function duration(milliseconds: number): string {
    if (!milliseconds) return "0 秒";
    const seconds = Math.round(milliseconds / 1000);
    if (seconds < 60) return `${seconds} 秒`;
    return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
  }

  function rangeValue(value: string): StatisticsRange {
    return value === "all" ? "all" : Number(value) as StatisticsRange;
  }

  function distributionTitle(dimension: StatisticsDimension): string {
    return dimensions.find((item) => item.value === dimension)?.label ?? dimension;
  }

  function ratingLabel(rating: string | undefined): string {
    if (!rating) return "";
    switch (rating) {
      case "again": return label("again", "重来");
      case "hard": return label("hard", "困难");
      case "good": return label("good", "良好");
      case "easy": return label("easy", "简单");
      default: return rating;
    }
  }

  function localizedMetricLabel(dimension: StatisticsDimension, key: string, fallback: string): string {
    if (key === "Unclassified") return label("statisticsUnclassified", "未分类");
    if (dimension === "subject") {
      const translationKey = subjectTranslationKeys[key];
      const defaultName = defaultSubjectNames[key] ?? fallback;
      return translationKey ? translations[translationKey] ?? defaultName : defaultName;
    }
    if (dimension === "question_type") {
      const labelKey = questionTypeLabelKeys[key];
      return labelKey ? label(labelKey, fallback) : fallback;
    }
    if (dimension === "category") {
      const dictionary = deps.topicDictionary();
      if (dictionary) {
        const resolved = resolveTopicDictionaryClassificationLabel(dictionary, "categories", key, "");
        if (resolved && resolved !== key) return resolved;
      }
      return fallback;
    }
    if (dimension === "collection" && key === "gold") {
      return label("statisticsCollectionGold", "真金题");
    }
    return fallback;
  }

  function formatQuestionLabel(questionId: string): string {
    const subjectPrefix = Object.keys(defaultSubjectNames).find((sub) => questionId.startsWith(sub));
    if (subjectPrefix) {
      const subName = defaultSubjectNames[subjectPrefix];
      const remainder = questionId.slice(subjectPrefix.length).replace(/^-(gold|real)-?/u, "").replace(/^-/u, "");
      return `${subName} ${remainder}`;
    }
    return questionId;
  }

  return {
    getSubjectIcon,
    getDimensionIcon,
    ranges,
    dimensions,
    fullscreenLabel,
    duration,
    rangeValue,
    distributionTitle,
    ratingLabel,
    localizedMetricLabel,
    formatQuestionLabel,
  };
}
