import { mount, unmount } from "svelte";
import type { TopicDictionaryDocument } from "@/question-bank/topic-dictionary";
import type { TopicDictionaryScanResult } from "@/question-bank/adapters/siyuan/topic-dictionary";
import TopicDictionary from "./TopicDictionary.svelte";

export interface TopicDictionaryLabels {
  title: string;
  scan: string;
  save: string;
  search: string;
  groupBy: string;
  filterState: string;
  all: string;
  present: string;
  retired: string;
  subject: string;
  category: string;
  collection: string;
  source: string;
  unclassified: string;
  displayName: string;
  suggestedName: string;
  empty: string;
  loading: string;
  saved: string;
  scanResult: string;
  visibleCount: string;
  autoScanOnOpen: string;
  openTab: string;
}

export interface TopicDictionaryOperations {
  load(): Promise<TopicDictionaryDocument>;
  scan(): Promise<TopicDictionaryScanResult>;
  saveLabels(labels: Readonly<Record<string, string>>): Promise<TopicDictionaryDocument>;
  setAutoScanOnOpen(value: boolean): void;
}

export interface TopicDictionaryConfig {
  autoScanOnOpen: boolean;
}

export function renderTopicDictionary(
  target: HTMLElement,
  labels: TopicDictionaryLabels,
  operations: TopicDictionaryOperations,
  config: TopicDictionaryConfig,
  onOpenTab?: () => void,
): () => void {
  const app = mount(TopicDictionary, {
    target,
    props: {labels, operations, config, onOpenTab},
  });
  return () => void unmount(app);
}
