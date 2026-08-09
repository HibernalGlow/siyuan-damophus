import { mount, unmount } from "svelte";
import SkillManager from "./SkillManager.svelte";
import { renderSkillMarkdown } from "./native-markdown";
import {
  getSkill,
  inspectSkillSourceRoot,
  listSkills,
  removeSkill,
  renameSkill,
  saveSkill,
  syncSkillFromRoot,
  syncSkillSourceRoot,
  type SkillDocument,
  type SkillSummary,
  type SkillSyncOptions,
  type SkillSyncResult,
  type SkillSyncState,
  type SkillSyncSummary,
} from "./api";

export interface SkillManagerLabels {
  title: string;
  refresh: string;
  openTab: string;
  source: string;
  syncAll: string;
  update: string;
  newSkill: string;
  select: string;
  content: string;
  save: string;
  rename: string;
  remove: string;
  empty: string;
  saved: string;
  synced: string;
  syncResult: string;
  failed: string;
  confirmRemove: string;
  search: string;
  filterState: string;
  allStates: string;
  sort: string;
  sortNameAsc: string;
  sortNameDesc: string;
  sortState: string;
  preview: string;
  edit: string;
  visibleCount: string;
  states: Record<SkillSyncState, string>;
}

export interface SkillManagerConfig {
  sourceRoot: string;
  onlyChanged: boolean;
  syncOptions: SkillSyncOptions;
}

export interface SkillManagerOperations {
  listSkills(): Promise<SkillSummary[] | null>;
  getSkill(name: string): Promise<SkillDocument>;
  saveSkill(name: string, content: string): Promise<void>;
  renameSkill(oldName: string, newName: string): Promise<void>;
  removeSkill(name: string): Promise<void>;
  inspectSkillSourceRoot(sourceRoot: string): Promise<SkillSyncSummary[]>;
  syncSkillSourceRoot(
    sourceRoot: string,
    onlyChanged: boolean,
    options?: SkillSyncOptions,
  ): Promise<SkillSyncResult>;
  syncSkillFromRoot(sourceRoot: string, name: string, options?: SkillSyncOptions): Promise<void>;
}

const defaultOperations: SkillManagerOperations = {
  listSkills,
  getSkill,
  saveSkill,
  renameSkill,
  removeSkill,
  inspectSkillSourceRoot,
  syncSkillSourceRoot,
  syncSkillFromRoot,
};

export function renderSkillManagerDock(
  target: HTMLElement,
  labels: SkillManagerLabels,
  config: SkillManagerConfig,
  operations: SkillManagerOperations = defaultOperations,
  onOpenTab?: () => void,
  markdownRenderer: (markdown: string) => string = renderSkillMarkdown,
): () => void {
  const app = mount(SkillManager, {
    target,
    props: { labels, config, operations, onOpenTab, markdownRenderer },
  });
  return () => void unmount(app);
}
