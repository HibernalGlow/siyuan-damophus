import { getBlockKramdownStrict, sqlStrict, updateBlockStrict } from "@/api";
import { Dialog, Menu, showMessage } from "siyuan";
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
  const tag = `${FLASHCARD_CATEGORY_PREFIX}${normalized}#`;
  const lines = markdown.split(/\r?\n/u);
  const tagged = lines.flatMap((line, index) => {
    FLASHCARD_CATEGORY_PATTERN.lastIndex = 0;
    return FLASHCARD_CATEGORY_PATTERN.test(line) ? [{ line, index }] : [];
  });
  if (tagged.length) {
    const depth = (line: string): number => (line.match(/^\s*/u)?.[0].length ?? 0) + (line.match(/(?:^|\s)>/gu)?.length ?? 0) * 4;
    const shallowest = Math.min(...tagged.map(({ line }) => depth(line)));
    const target = tagged.find(({ line }) => depth(line) === shallowest);
    if (target) {
      lines[target.index] = `${target.line.replace(/\s*$/u, "")} ${tag}`;
      return lines.join("\n");
    }
  }
  const trimmed = markdown.replace(/\n+$/u, "");
  return trimmed ? `${trimmed}\n${tag}` : tag;
}

export function removeFlashcardCategory(markdown: string, name: string): string {
  const normalized = normalizeCategoryName(name);
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(`#闪卡\\/分类\\/${escaped}#`, "gu");
  const lines = markdown.split(/\r?\n/u);
  const tagged = lines.flatMap((line, index) => {
    FLASHCARD_CATEGORY_PATTERN.lastIndex = 0;
    return FLASHCARD_CATEGORY_PATTERN.test(line) ? [{ line, index }] : [];
  });
  if (!tagged.length) return markdown;
  const depth = (line: string): number => (line.match(/^\s*/u)?.[0].length ?? 0) + (line.match(/(?:^|\s)>/gu)?.length ?? 0) * 4;
  const shallowest = Math.min(...tagged.map(({ line }) => depth(line)));
  for (const { index } of tagged.filter(({ line }) => depth(line) === shallowest)) lines[index] = lines[index].replace(pattern, "");
  return lines.join("\n").replace(/[ \t]+\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trimEnd();
}

export function renameFlashcardCategory(markdown: string, oldName: string, newName: string): string {
  const oldValue = normalizeCategoryName(oldName);
  const newValue = normalizeCategoryName(newName);
  const escaped = oldValue.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const lines = markdown.split(/\r?\n/u);
  const tagged = lines.flatMap((line, index) => {
    FLASHCARD_CATEGORY_PATTERN.lastIndex = 0;
    return FLASHCARD_CATEGORY_PATTERN.test(line) ? [{ line, index }] : [];
  });
  if (!tagged.length) return markdown;
  const depth = (line: string): number => (line.match(/^\s*/u)?.[0].length ?? 0) + (line.match(/(?:^|\s)>/gu)?.length ?? 0) * 4;
  const shallowest = Math.min(...tagged.map(({ line }) => depth(line)));
  const pattern = new RegExp(`#闪卡\\/分类\\/${escaped}#`, "gu");
  for (const { index } of tagged.filter(({ line }) => depth(line) === shallowest)) lines[index] = lines[index].replace(pattern, `${FLASHCARD_CATEGORY_PREFIX}${newValue}#`);
  return lines.join("\n");
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
        let resolved: { blockId: string; markdown: string };
        try {
          resolved = await this.resolveCardBlock(context, card);
        } catch (error) {
          showMessage(error instanceof Error ? error.message : String(error), 4000, "error");
          return;
        }
        const { blockId, markdown } = resolved;
        const selected = new Set(parseFlashcardCategories(markdown));
        const menu = new Menu("damophus-flashcard-category-menu");
        const names = [...new Set([...this.config.rules.map((rule) => rule.name), ...selected])];
        for (const name of names) {
          menu.addItem({
            icon: selected.has(name) ? "iconCheck" : "iconUncheck",
            label: name,
            click: async () => {
              const result = await this.mutateBlock(blockId, selected.has(name) ? "remove" : "add", name);
              this.showMutationResult(result, name);
            },
          });
        }
        menu.addItem({ type: "separator" });
        menu.addItem({ label: "新建并标记分类", click: () => this.openCreateCategoryDialog(blockId) });
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

  private async resolveCardBlock(context: { root: HTMLElement }, card: RiffCardRecord): Promise<{ blockId: string; markdown: string }> {
    const candidates = [
      card.blockID,
      ...[...context.root.querySelectorAll<HTMLElement>("[data-node-id]")].map((node) => node.dataset.nodeId ?? ""),
    ].filter((id, index, all): id is string => Boolean(id) && all.indexOf(id) === index);
    let lastError: unknown;
    for (const blockId of candidates) {
      try {
        const current = await getBlockKramdownStrict(blockId);
        return { blockId, markdown: typeof current.kramdown === "string" ? current.kramdown : "" };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("无法找到当前闪卡对应的块");
  }

  async createCategory(name: string): Promise<FlashcardCategoryRule> {
    const normalized = normalizeCategoryName(name);
    const existing = this.config.rules.find((rule) => rule.name === normalized);
    if (existing) return existing;
    const rule: FlashcardCategoryRule = { name: normalized, participatesInReview: false, reviewOrder: this.config.rules.length, displayOrder: this.config.rules.length, enabled: true };
    await this.save({ ...this.config, rules: [...this.config.rules, rule] });
    return rule;
  }

  private showMutationResult(result: CategoryBatchReceipt, name: string): void {
    if (result.status === "failed") showMessage(result.error ?? "分类更新失败", 4000, "error");
    else if (result.status === "updated") showMessage(`已${result.operation === "add" ? "添加" : "移除"}分类“${name}”`, 2500, "info");
    else showMessage(`分类“${name}”无需更新`, 2000, "info");
  }

  private openCreateCategoryDialog(blockId: string): void {
    const dialog = new Dialog({ title: "新建闪卡分类", content: `<div class="b3-dialog__content"><label class="b3-label">分类名称</label><input class="b3-text-field" data-category-name type="text" placeholder="例如：易混淆" /></div><div class="b3-dialog__action"><button class="b3-button b3-button--cancel" data-action="cancel">取消</button><button class="b3-button" data-action="create">创建并标记</button></div>` });
    const input = dialog.element.querySelector<HTMLInputElement>("[data-category-name]");
    input?.focus();
    dialog.element.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.addEventListener("click", () => dialog.destroy());
    dialog.element.querySelector<HTMLButtonElement>('[data-action="create"]')?.addEventListener("click", async () => {
      try {
        const rule = await this.createCategory(input?.value ?? "");
        const result = await this.mutateBlock(blockId, "add", rule.name);
        dialog.destroy();
        this.showMutationResult(result, rule.name);
      } catch (error) { showMessage(error instanceof Error ? error.message : String(error), 3500, "error"); }
    });
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
    const pattern = `#闪卡/分类/${normalized}#`.replace(/[\\%_']/gu, (value) => value === "'" ? "''" : `\\${value}`);
    const rows = await sqlStrict<Array<{ id: string }>>(`SELECT id FROM blocks WHERE content LIKE '%${pattern}%' ESCAPE '\\'`);
    return rows.map((row) => row.id).filter(Boolean);
  }
}
