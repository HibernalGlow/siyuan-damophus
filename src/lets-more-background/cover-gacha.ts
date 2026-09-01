import { Dialog } from "siyuan";
import { plugin } from "@/utils";
import { getLogger } from "@/libs/logger";
import { isolateMobileDialogGestures } from "@/lets-question-bank/workspace/mobile-dialog-scroll";
import { coverFavoriteKey } from "./cover-favorites";
import type { BooruResolvedInfo } from "./booru";

const log = getLogger("lets-more-background:gacha");

/**
 * 暂存区：抽卡时被收藏但没有被选为题头图的候选卡。与收藏（favorites）独立，
 * 支持「随机取出一张并从暂存区删除」的一次性消费语义。
 */
export const COVER_STASH_STORAGE_NAME = "more_background_cover_stash.json";
export const COVER_STASH_SCHEMA_VERSION = 1;
export const MAX_COVER_STASH = 500;

export interface CoverStashEntry {
  id: string;
  imageUrl: string;
  previewUrl?: string;
  postUrl?: string;
  site?: string;
  postId?: string | number;
  tags?: string[];
  width?: number | string;
  height?: number | string;
  score?: number | string;
  templateLabel?: string;
  addedAt: string;
}

export type CoverStashInput = Omit<CoverStashEntry, "id" | "addedAt">;

export interface CoverStashStorage {
  loadData(name: string): Promise<unknown>;
  saveData(name: string, value: unknown): Promise<unknown>;
}

let memoryStash: CoverStashEntry[] | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function storageOrDefault(storage?: CoverStashStorage): CoverStashStorage {
  return storage || (plugin as unknown as CoverStashStorage);
}

function asText(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function normalizeStashEntry(value: unknown, index: number): CoverStashEntry | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CoverStashEntry>;
  const imageUrl = asText(raw.imageUrl);
  if (!imageUrl) return null;
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : undefined;
  return {
    id: asText(raw.id) || `cover-stash-${Date.now()}-${index}`,
    imageUrl,
    previewUrl: asText(raw.previewUrl),
    postUrl: asText(raw.postUrl),
    site: asText(raw.site),
    postId: raw.postId === undefined || raw.postId === null || raw.postId === "" ? undefined : raw.postId,
    tags: tags?.length ? tags : undefined,
    width: raw.width,
    height: raw.height,
    score: raw.score,
    templateLabel: asText(raw.templateLabel),
    addedAt: asText(raw.addedAt) || new Date().toISOString(),
  };
}

export function coverStashKey(value: Pick<CoverStashEntry, "imageUrl" | "postUrl" | "site" | "postId">): string {
  return coverFavoriteKey(value);
}

function parseStash(raw: unknown): CoverStashEntry[] {
  let source: unknown = raw;
  if (typeof raw === "string") {
    try {
      source = JSON.parse(raw);
    } catch {
      source = [];
    }
  }
  if (!Array.isArray(source)) {
    source = (source as { items?: unknown[] } | null)?.items;
  }
  if (!Array.isArray(source)) return [];
  const result: CoverStashEntry[] = [];
  const seen = new Set<string>();
  source.forEach((item, index) => {
    const normalized = normalizeStashEntry(item, index);
    if (!normalized) return;
    const key = coverStashKey(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result.slice(0, MAX_COVER_STASH);
}

export async function loadCoverStash(storage?: CoverStashStorage): Promise<CoverStashEntry[]> {
  if (memoryStash) return memoryStash.map((item) => ({ ...item, tags: item.tags ? [...item.tags] : undefined }));
  try {
    memoryStash = parseStash(await storageOrDefault(storage).loadData(COVER_STASH_STORAGE_NAME));
  } catch (error) {
    log.warn("Failed to load cover stash:", error);
    memoryStash = [];
  }
  return memoryStash.map((item) => ({ ...item, tags: item.tags ? [...item.tags] : undefined }));
}

async function saveCoverStash(stash: CoverStashEntry[], storage?: CoverStashStorage): Promise<void> {
  const normalized = parseStash(stash);
  memoryStash = normalized;
  const target = storageOrDefault(storage);
  writeQueue = writeQueue.then(async () => {
    await target.saveData(COVER_STASH_STORAGE_NAME, {
      schemaVersion: COVER_STASH_SCHEMA_VERSION,
      items: normalized,
      updatedAt: new Date().toISOString(),
    });
  });
  await writeQueue;
}

/** Adds one card to the stash; duplicates (same post identity or URL) are ignored. */
export async function addCoverStashEntry(
  input: CoverStashInput,
  storage?: CoverStashStorage,
): Promise<{ added: boolean; stash: CoverStashEntry[] }> {
  const current = await loadCoverStash(storage);
  const key = coverStashKey(input);
  if (current.some((item) => coverStashKey(item) === key)) {
    return { added: false, stash: current };
  }
  const entry: CoverStashEntry = {
    ...input,
    imageUrl: input.imageUrl.trim(),
    id: `cover-stash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    addedAt: new Date().toISOString(),
  };
  const stash = [entry, ...current].slice(0, MAX_COVER_STASH);
  await saveCoverStash(stash, storage);
  return { added: true, stash };
}

export async function removeCoverStashEntry(id: string, storage?: CoverStashStorage): Promise<CoverStashEntry[]> {
  const current = await loadCoverStash(storage);
  const stash = current.filter((item) => item.id !== id);
  await saveCoverStash(stash, storage);
  return stash;
}

export async function clearCoverStash(storage?: CoverStashStorage): Promise<void> {
  await saveCoverStash([], storage);
}

/** Drops the in-memory cache so the next load re-reads storage (used by tests). */
export async function clearCoverStashCache(): Promise<void> {
  memoryStash = null;
}

/** Random peek without removal; remove via removeCoverStashEntry after a successful apply. */
export async function peekRandomCoverStash(storage?: CoverStashStorage): Promise<CoverStashEntry | null> {
  const current = await loadCoverStash(storage);
  if (current.length === 0) return null;
  return current[Math.floor(Math.random() * current.length)];
}

/** Synchronous count from the in-memory cache (0 before the first load). */
export function getCoverStashCountSync(): number {
  return memoryStash?.length ?? 0;
}

/** One candidate card inside the gacha dialog. */
export interface GachaCardData {
  key: string;
  /** Full-size image that gets applied when the card is picked. */
  imageUrl: string;
  /** Optional smaller variant used as the grid thumbnail. */
  previewUrl?: string;
  postUrl?: string;
  site?: string;
  postId?: string | number;
  tags?: string[];
  width?: number | string;
  height?: number | string;
  score?: number | string;
  /** Resolved booru info for exact re-apply (booru cards only). */
  info?: BooruResolvedInfo | null;
  /** Rendered thumbnail element; enables canvas capture for random-endpoint cards. */
  element?: HTMLImageElement | null;
  /** 浏览暂存区时：该卡对应的暂存条目 id，应用成功后据此移出暂存区。 */
  stashEntryId?: string;
}

export interface CoverGachaDialogConfig {
  title: string;
  hint: string;
  drawing: string;
  empty: string;
  pickLabel: string;
  favoriteLabel: string;
  favoritedLabel: string;
  stashLabel: string;
  stashedLabel: string;
  rerollLabel: string;
  failedLabel: string;
  mobile: boolean;
  /** 流式抽卡：每解析出一张立即经 onCard 上屏，不等整批完成；onProgress 驱动进度文案。 */
  drawCards: (handlers: {
    onCard: (card: GachaCardData) => void;
    onProgress: (done: number, wanted: number) => void;
  }) => Promise<GachaCardData[]>;
  onPick: (card: GachaCardData) => Promise<void>;
  /** 收藏 → 收藏夹（favorites）；Toggles 状态以返回值为准。 */
  isFavorited: (card: GachaCardData) => boolean;
  onFavoriteToggle: (card: GachaCardData) => Promise<boolean>;
  /** 暂存 → 暂存区（stash，待用卡）；与收藏完全独立。 */
  isStashed: (card: GachaCardData) => boolean;
  onStashToggle: (card: GachaCardData) => Promise<boolean>;
}

const GACHA_STYLE = `
.damophus-cover-gacha { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.damophus-cover-gacha__hint { padding: 8px 14px; font-size: 12px; color: var(--b3-theme-on-surface-light); border-bottom: 1px solid var(--b3-border-color); }
.damophus-cover-gacha__body { flex: 1; min-height: 0; overflow: auto; padding: 12px 14px; -webkit-overflow-scrolling: touch; }
.damophus-cover-gacha__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
.damophus-cover-gacha[data-mobile="true"] .damophus-cover-gacha__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.damophus-cover-gacha[data-mobile="true"] .damophus-cover-gacha__hint { padding: 8px 12px; }
.damophus-cover-gacha[data-mobile="true"] .damophus-cover-gacha__body { padding: 10px 12px; padding-bottom: max(10px, env(safe-area-inset-bottom)); }
.damophus-cover-gacha__status { padding: 40px 12px; text-align: center; color: var(--b3-theme-on-surface-light); font-size: 13px; }
.damophus-gacha-card { display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 1px solid var(--b3-border-color); border-radius: 10px; background: var(--b3-theme-surface); }
.damophus-gacha-card__thumb { position: relative; aspect-ratio: 16 / 10; overflow: hidden; border-radius: 7px; background: var(--b3-theme-surface-lighter); cursor: pointer; }
.damophus-gacha-card__thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.damophus-gacha-card__thumb--broken { display: flex; align-items: center; justify-content: center; color: var(--b3-theme-on-surface-light); font-size: 11px; }
.damophus-gacha-card__meta { font-size: 11px; color: var(--b3-theme-on-surface-light); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.damophus-gacha-card__tags { font-size: 10px; color: var(--b3-theme-on-surface-light); opacity: .85; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.damophus-gacha-card__actions { display: flex; gap: 6px; align-items: center; }
.damophus-gacha-card__pick { flex: 1; min-width: 0; }
.damophus-gacha-card__mark { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; min-width: 34px; height: 28px; border: 1px solid var(--b3-border-color); border-radius: 6px; background: transparent; color: var(--b3-theme-on-surface); cursor: pointer; font-size: 13px; line-height: 1; }
.damophus-gacha-card__mark[data-active="true"] { color: var(--b3-theme-primary); border-color: var(--b3-theme-primary); }
.damophus-cover-gacha__footer { display: flex; gap: 8px; justify-content: flex-end; align-items: center; padding: 10px 14px; border-top: 1px solid var(--b3-border-color); }
.damophus-cover-gacha[data-mobile="true"] .damophus-cover-gacha__footer { padding-bottom: max(10px, env(safe-area-inset-bottom)); }
.damophus-gacha-card--busy { opacity: .6; pointer-events: none; }
.damophus-cover-gacha-float { border: 1px solid var(--b3-border-color); box-shadow: 0 10px 36px rgba(0, 0, 0, .28); }
`;

/**
 * 非模态浮窗化：外层 .b3-dialog 是全屏 fixed 容器，会吃掉整个视口的点击，
 * 必须把它设为 pointer-events:none、只让弹窗本体接收事件；再删掉自带半透明
 * 暗色背景（--b3-mask-background）的遮罩，避免压暗四周。拖拽（标题栏）、
 * 八向缩放（边缘）、位置+尺寸记忆全部交给思源原生 moveResize——调用方传
 * positionId 并设置同名 data-key 后，由思源持久化、跨重启生效。
 */
function makeFloating(dialog: Dialog, positionKey: string): void {
  dialog.element.setAttribute("data-key", positionKey);
  const wrapper = dialog.element.querySelector<HTMLElement>(".b3-dialog");
  if (wrapper) wrapper.style.pointerEvents = "none";
  dialog.element.querySelector(".b3-dialog__scrim")?.remove();
  const container = dialog.element.querySelector<HTMLElement>(".b3-dialog__container");
  if (container) {
    container.style.pointerEvents = "auto";
    container.classList.add("damophus-cover-gacha-float");
  }
}

function buildCard(
  card: GachaCardData,
  config: CoverGachaDialogConfig,
  dialog: Dialog,
): HTMLElement {
  const item = document.createElement("article");
  item.className = "damophus-gacha-card";

  const thumb = document.createElement("div");
  thumb.className = "damophus-gacha-card__thumb";
  const image = document.createElement("img");
  image.loading = "lazy";
  image.referrerPolicy = "no-referrer";
  image.alt = card.site ? `${card.site} #${card.postId ?? ""}` : card.imageUrl;
  image.src = card.previewUrl || card.imageUrl;
  image.addEventListener("error", () => {
    thumb.classList.add("damophus-gacha-card__thumb--broken");
    thumb.textContent = config.failedLabel;
  });
  thumb.appendChild(image);
  item.appendChild(thumb);
  card.element = image;

  const meta = document.createElement("div");
  meta.className = "damophus-gacha-card__meta";
  meta.textContent = [
    card.site || "",
    card.postId !== undefined && card.postId !== "" ? `#${card.postId}` : "",
    card.score !== undefined && card.score !== "" ? `★ ${card.score}` : "",
    card.width && card.height ? `${card.width}×${card.height}` : "",
  ].filter(Boolean).join(" · ") || card.imageUrl;
  item.appendChild(meta);

  if (card.tags?.length) {
    const tags = document.createElement("div");
    tags.className = "damophus-gacha-card__tags";
    tags.textContent = card.tags.slice(0, 5).join(" ");
    tags.title = card.tags.join(" ");
    item.appendChild(tags);
  }

  const actions = document.createElement("div");
  actions.className = "damophus-gacha-card__actions";

  const pick = document.createElement("button");
  pick.className = "b3-button b3-button--outline damophus-gacha-card__pick";
  pick.textContent = config.pickLabel;
  const applyPick = async () => {
    item.classList.add("damophus-gacha-card--busy");
    try {
      await config.onPick(card);
      // 应用成功才关窗；onPick 抛错（如暂存卡应用失败）时保持打开可重试。
      dialog.destroy();
    } catch (error) {
      log.warn("Failed to apply picked card:", error);
      item.classList.remove("damophus-gacha-card--busy");
    }
  };
  pick.addEventListener("click", () => { void applyPick(); });
  thumb.addEventListener("click", () => { void applyPick(); });
  actions.appendChild(pick);

  // 收藏（★ → 收藏夹）与暂存（⚑ → 暂存区待用）是两个独立动作、两个独立存储。
  const buildMark = (glyph: () => string, active: () => boolean, title: () => string, toggle: (card: GachaCardData) => Promise<boolean>) => {
    const button = document.createElement("button");
    button.className = "damophus-gacha-card__mark";
    const sync = () => {
      button.setAttribute("data-active", active() ? "true" : "false");
      button.textContent = glyph();
      button.title = title();
    };
    sync();
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await toggle(card);
      } catch (error) {
        log.warn("Failed to toggle cover mark:", error);
      } finally {
        sync();
        button.disabled = false;
      }
    });
    return button;
  };

  actions.appendChild(buildMark(
    () => (config.isFavorited(card) ? "★" : "☆"),
    () => config.isFavorited(card),
    () => (config.isFavorited(card) ? config.favoritedLabel : config.favoriteLabel),
    config.onFavoriteToggle,
  ));
  actions.appendChild(buildMark(
    () => "⚑",
    () => config.isStashed(card),
    () => (config.isStashed(card) ? config.stashedLabel : config.stashLabel),
    config.onStashToggle,
  ));

  item.appendChild(actions);
  return item;
}

/**
 * Gacha picker dialog: renders one batch of candidate cards, lets the user
 * apply one as the document cover and stash-favorite the rest. Re-rendering
 * (换一批) simply calls drawCards again inside the same dialog.
 */
const GACHA_FLOAT_KEY = "damophus-cover-gacha";
const STASH_FLOAT_KEY = "damophus-cover-stash";

export function openCoverGachaDialog(config: CoverGachaDialogConfig): void {
  let disposeGestureIsolation: (() => void) | undefined;
  const dialog = new Dialog({
    title: config.title,
    content: `<div class="damophus-cover-gacha"><style>${GACHA_STYLE}</style><div class="damophus-cover-gacha__hint"></div><div class="damophus-cover-gacha__body"><div class="damophus-cover-gacha__grid"></div></div><div class="damophus-cover-gacha__footer"></div></div>`,
    width: config.mobile ? "100vw" : "min(72vw, 880px)",
    height: config.mobile ? "100dvh" : "min(68dvh, 620px)",
    destroyCallback: () => { disposeGestureIsolation?.(); },
    ...(config.mobile ? {} : { positionId: GACHA_FLOAT_KEY }),
  });
  if (config.mobile) {
    // 移动端保持全屏模态；隔离触摸手势，防止思源手机壳层把滑动抢走。
    disposeGestureIsolation = isolateMobileDialogGestures(dialog.element);
  } else {
    try {
      makeFloating(dialog, GACHA_FLOAT_KEY);
    } catch (error) {
      // 浮窗化失败时退化为普通模态，绝不能阻断后面的 render()（否则弹窗空白）。
      log.warn("Failed to floatify the cover dialog:", error);
    }
  }
  dialog.element.querySelector<HTMLElement>(".damophus-cover-gacha")
    ?.setAttribute("data-mobile", config.mobile ? "true" : "false");

  const hint = dialog.element.querySelector<HTMLElement>(".damophus-cover-gacha__hint");
  const body = dialog.element.querySelector<HTMLElement>(".damophus-cover-gacha__body");
  const grid = dialog.element.querySelector<HTMLElement>(".damophus-cover-gacha__grid");
  const footer = dialog.element.querySelector<HTMLElement>(".damophus-cover-gacha__footer");
  if (!hint || !body || !grid || !footer) {
    dialog.destroy();
    return;
  }
  hint.textContent = config.hint;

  const reroll = document.createElement("button");
  reroll.className = "b3-button b3-button--outline";
  reroll.textContent = config.rerollLabel;
  reroll.addEventListener("click", () => { void render(); });
  footer.appendChild(reroll);

  const close = document.createElement("button");
  close.className = "b3-button b3-button--cancel";
  close.textContent = "✕";
  close.addEventListener("click", () => dialog.destroy());
  footer.appendChild(close);

  async function render(): Promise<void> {
    reroll.disabled = true;
    grid.replaceChildren();
    const status = document.createElement("div");
    status.className = "damophus-cover-gacha__status";
    status.textContent = config.drawing;
    body.replaceChildren(status, grid);
    const cards: GachaCardData[] = [];
    try {
      await config.drawCards({
        // 抽到一张立即上屏，前面的卡先可见、可操作，不必等整批抽完。
        onCard: (card) => {
          cards.push(card);
          grid.appendChild(buildCard(card, config, dialog));
        },
        onProgress: (done, wanted) => {
          status.textContent = `${config.drawing} (${done}/${wanted})`;
        },
      });
    } catch (error) {
      log.warn("Gacha draw failed:", error);
    }
    reroll.disabled = false;
    if (cards.length === 0) {
      status.textContent = config.empty;
      body.replaceChildren(status);
    } else {
      status.remove();
    }
  }

  void render();
}
