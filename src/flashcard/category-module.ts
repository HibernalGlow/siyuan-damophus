import { getBlockKramdownStrict, sqlStrict, updateBlockStrict } from "@/api";
import { Menu, showMessage } from "siyuan";
import type { FlashcardRoot } from "./types";
import type { RiffCardRecord } from "./siyuan-adapter";
import { registerFlashcardContribution, type FlashcardReviewStage } from "./contribution-registry";
import { registerReviewToolbarAction } from "./review-action-registry";

export const FLASHCARD_CATEGORY_PREFIX = "#闪卡/分类/";
export const FLASHCARD_CATEGORY_PATTERN = /#闪卡\/分类\/([^#\r\n]+)#/gu;

export interface FlashcardCategoryRule {
  name: string;
  participatesInReview: boolean;
  reviewOrder: number;
  displayOrder: number;
  color?: string;
  enabled: boolean;
}

export interface FlashcardCategoryConfig {
  schemaVersion: 1;
  enabled: boolean;
  reviewEnabled: boolean;
  rules: FlashcardCategoryRule[];
  receiptLimit?: number;
}

export interface CategoryBatchReceipt {
  operation: "add" | "remove" | "rename";
  oldName?: string;
  newName?: string;
  blockId: string;
  status: "updated" | "skipped" | "failed";
  error?: string;
}

export const DEFAULT_FLASHCARD_CATEGORY_CONFIG: FlashcardCategoryConfig = {
  schemaVersion: 1,
  enabled: true,
  reviewEnabled: true,
  rules: [{ name: "重点", participatesInReview: true, reviewOrder: 0, displayOrder: 0, enabled: true }],
  receiptLimit: 20,
};

export function normalizeCategoryName(value: string): string {
  const name = value.trim();
  if (!name || /[#/\r\n]/u.test(name)) throw new Error("分类名称不能包含 #、/ 或换行");
  return /[A-Za-z]/u.test(name) ? name.toLocaleLowerCase() : name;
}

export function parseFlashcardCategories(markdown: string): string[] {
  const result: string[] = [];
  const lines = markdown.split(/\r?\n/u);
  const taggedLines = lines.filter((line) => {
    FLASHCARD_CATEGORY_PATTERN.lastIndex = 0;
    return FLASHCARD_CATEGORY_PATTERN.test(line);
  });
  if (taggedLines.length === 0) return result;
  const depth = (line: string): number => (line.match(/^\s*/u)?.[0].length ?? 0) + (line.match(/(?:^|\s)>/gu)?.length ?? 0) * 4;
  const shallowest = Math.min(...taggedLines.map(depth));
  for (const line of taggedLines.filter((candidate) => depth(candidate) === shallowest)) {
    FLASHCARD_CATEGORY_PATTERN.lastIndex = 0;
    for (const match of line.matchAll(FLASHCARD_CATEGORY_PATTERN)) {
      const name = match[1].trim();
      if (name && !result.includes(name)) result.push(name);
    }
  }
  FLASHCARD_CATEGORY_PATTERN.lastIndex = 0;
  return result;
}

export function addFlashcardCategory(markdown: string, name: string): string {
  const normalized = normalizeCategoryName(name);
  if (parseFlashcardCategories(markdown).includes(normalized)) return markdown;
  const trimmed = markdown.replace(/\n+$/u, "");
  const tag = `${FLASHCARD_CATEGORY_PREFIX}${normalized}#`;
  return trimmed ? `${trimmed}\n${tag}` : tag;
}

export function removeFlashcardCategory(markdown: string, name: string): string {
  const normalized = normalizeCategoryName(name);
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(`#闪卡\\/分类\\/${escaped}#`, "gu");
  return markdown.replace(pattern, "").replace(/[ \t]+\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trimEnd();
}

export function renameFlashcardCategory(markdown: string, oldName: string, newName: string): string {
  const oldValue = normalizeCategoryName(oldName);
  const newValue = normalizeCategoryName(newName);
  const escaped = oldValue.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return markdown.replace(new RegExp(`#闪卡\\/分类\\/${escaped}#`, "gu"), `${FLASHCARD_CATEGORY_PREFIX}${newValue}#`);
}

function categoryRank(root: FlashcardRoot | undefined, rules: readonly FlashcardCategoryRule[]): number {
  if (!root || !root.content) return Number.MAX_SAFE_INTEGER;
  const names = parseFlashcardCategories(root.content);
  const ranks = names
    .map((name) => rules.find((rule) => rule.enabled && rule.participatesInReview && rule.name === name)?.reviewOrder)
    .filter((value): value is number => value !== undefined);
  return ranks.length ? Math.min(...ranks) : Number.MAX_SAFE_INTEGER;
}

export function orderCardsByCategory(
  cards: readonly RiffCardRecord[],
  roots: readonly FlashcardRoot[],
  config: FlashcardCategoryConfig,
): RiffCardRecord[] {
  if (!config.enabled || !config.reviewEnabled) return [...cards];
  const rules = [...config.rules].sort((left, right) => left.reviewOrder - right.reviewOrder);
  const rootsById = new Map(roots.map((root) => [root.blockId, root]));
  return cards.map((card, index) => ({ card, index, rank: categoryRank(rootsById.get(card.blockID), rules) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ card }) => card);
}

export function categoryRanksByBlockId(
  roots: readonly FlashcardRoot[],
  config: FlashcardCategoryConfig,
): ReadonlyMap<string, number> | undefined {
  if (!config.enabled || !config.reviewEnabled) return undefined;
  const rules = [...config.rules].sort((left, right) => left.reviewOrder - right.reviewOrder);
  if (!rules.some((rule) => rule.enabled && rule.participatesInReview)) return undefined;
  return new Map(roots.map((root) => [root.blockId, categoryRank(root, rules)]));
}

export function mergeFlashcardCategoryConfig(value: unknown): FlashcardCategoryConfig {
  const input = value && typeof value === "object" ? value as Partial<FlashcardCategoryConfig> : {};
  const rawRules = Array.isArray(input.rules) ? input.rules : DEFAULT_FLASHCARD_CATEGORY_CONFIG.rules;
  const rules = rawRules.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<FlashcardCategoryRule>;
    try {
      const name = normalizeCategoryName(String(item.name ?? ""));
      return [{ name, participatesInReview: item.participatesInReview === true, reviewOrder: Number(item.reviewOrder ?? 0), displayOrder: Number(item.displayOrder ?? 0), color: typeof item.color === "string" ? item.color : undefined, enabled: item.enabled !== false }];
    } catch { return []; }
  });
  return { schemaVersion: 1, enabled: input.enabled !== false, reviewEnabled: input.reviewEnabled !== false, rules, receiptLimit: Math.max(1, Number(input.receiptLimit ?? 20)) };
}

export class FlashcardCategoryModule {
  private config: FlashcardCategoryConfig = mergeFlashcardCategoryConfig(undefined);
  private loaded = false;

  constructor(private readonly storage: { load(): Promise<unknown>; save(value: unknown): Promise<void> }) {}

  async load(): Promise<FlashcardCategoryConfig> {
    if (!this.loaded) {
      this.config = mergeFlashcardCategoryConfig(await this.storage.load());
      this.loaded = true;
    }
    return structuredClone(this.config);
  }

  async save(config: FlashcardCategoryConfig): Promise<void> {
    this.config = mergeFlashcardCategoryConfig(config);
    this.loaded = true;
    await this.storage.save(this.config);
  }

  getConfig(): FlashcardCategoryConfig { return structuredClone(this.config); }

  registerContribution(): () => void {
    const stage: FlashcardReviewStage = {
      getRank: (blockId, root) => {
        const rules = [...this.config.rules].sort((left, right) => left.reviewOrder - right.reviewOrder);
        return categoryRank((root as FlashcardRoot | undefined) ?? { blockId, renderer: "unknown", kind: "unknown", attributes: {} }, rules);
      },
    };
    return registerFlashcardContribution({ id: "category.review-stage", kind: "review-stage", owner: "flashcard-category", value: stage, order: 100 });
  }

  registerToolbarAction(): () => void {
    return registerReviewToolbarAction({
      id: "category",
      icon: "iconTags",
      label: "闪卡分类",
      source: "flashcard-category",
      isEnabled: () => this.config.enabled,
      execute: async (context) => {
        const card = await context.resolveCard();
        if (!card) return;
        const current = await getBlockKramdownStrict(card.blockID);
        const markdown = typeof current.kramdown === "string" ? current.kramdown : "";
        const selected = new Set(parseFlashcardCategories(markdown));
        const menu = new Menu("damophus-flashcard-category-menu");
        for (const rule of this.config.rules) {
          menu.addItem({
            icon: selected.has(rule.name) ? "iconCheck" : "iconUncheck",
            label: rule.name,
            click: async () => {
              const result = await this.mutateBlock(card.blockID, selected.has(rule.name) ? "remove" : "add", rule.name);
              if (result.status === "failed") showMessage(result.error ?? "分类更新失败", 4000, "error");
            },
          });
        }
        menu.addItem({ type: "separator" });
        menu.addItem({ label: "新建并标记分类", click: async () => {
          const name = typeof window !== "undefined" ? window.prompt("分类名称") : "";
          if (!name?.trim()) return;
          const result = await this.mutateBlock(card.blockID, "add", name);
          if (result.status === "failed") showMessage(result.error ?? "分类更新失败", 4000, "error");
        } });
        const rect = context.trigger.getBoundingClientRect();
        menu.open({ x: rect.left, y: rect.bottom, isLeft: false });
      },
    });
  }

  order(cards: readonly RiffCardRecord[], roots: readonly FlashcardRoot[]): RiffCardRecord[] {
    return orderCardsByCategory(cards, roots, this.config);
  }

  async mutateBlock(blockId: string, operation: "add" | "remove", name: string): Promise<CategoryBatchReceipt> {
    try {
      const current = await getBlockKramdownStrict(blockId);
      const markdown = typeof current.kramdown === "string" ? current.kramdown : "";
      const next = operation === "add" ? addFlashcardCategory(markdown, name) : removeFlashcardCategory(markdown, name);
      if (next === markdown) return { operation, blockId, status: "skipped" };
      await updateBlockStrict("markdown", next, blockId);
      return { operation, blockId, status: "updated" };
    } catch (error) {
      return { operation, blockId, status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
  }

  async renameBlocks(blockIds: readonly string[], oldName: string, newName: string): Promise<CategoryBatchReceipt[]> {
    const receipts: CategoryBatchReceipt[] = [];
    for (const blockId of blockIds) {
      try {
        const current = await getBlockKramdownStrict(blockId);
        const markdown = typeof current.kramdown === "string" ? current.kramdown : "";
        const next = renameFlashcardCategory(markdown, oldName, newName);
        if (next === markdown) receipts.push({ operation: "rename", oldName, newName, blockId, status: "skipped" });
        else { await updateBlockStrict("markdown", next, blockId); receipts.push({ operation: "rename", oldName, newName, blockId, status: "updated" }); }
      } catch (error) { receipts.push({ operation: "rename", oldName, newName, blockId, status: "failed", error: error instanceof Error ? error.message : String(error) }); }
    }
    return receipts;
  }

  async findBlocks(name: string): Promise<string[]> {
    const normalized = normalizeCategoryName(name);
    const rows = await sqlStrict<Array<{ id: string }>>(`SELECT id FROM blocks WHERE content LIKE '%#闪卡/分类/${normalized}#%'`);
    return rows.map((row) => row.id).filter(Boolean);
  }
}
