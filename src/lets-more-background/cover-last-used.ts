import type { CoverSourceItem } from "./sources";

const LAST_USED_SOURCE_KEY = "damophus_more_background_last_used_source";
let memoryLastUsedSource: CoverSourceItem | null = null;

export function getLastUsedSource(): CoverSourceItem | null {
  if (memoryLastUsedSource) return memoryLastUsedSource;
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(LAST_USED_SOURCE_KEY);
      if (raw) {
        memoryLastUsedSource = JSON.parse(raw);
        return memoryLastUsedSource;
      }
    }
  } catch {}
  return null;
}

export function updateAllLastUsedButtons(item: CoverSourceItem): void {
  if (typeof document === "undefined") return;
  const lastLabel = item.label ? `${item.label}` : "上次使用的模板";
  const newTitle = `使用上次配置: ${lastLabel}`;
  const buttons = document.querySelectorAll<HTMLElement>('[data-type="more-background-last"]');
  buttons.forEach((btn) => {
    if (btn.title !== newTitle) {
      btn.title = newTitle;
    }
    const labelSpan = btn.querySelector<HTMLElement>(".damophus-last-label");
    if (labelSpan) {
      if (labelSpan.textContent !== `⚡ ${lastLabel}`) {
        labelSpan.textContent = `⚡ ${lastLabel}`;
      }
    } else {
      if (btn.tagName === "BUTTON") {
        btn.innerHTML = `<svg><use xlink:href="#iconRefresh"></use></svg><span class="damophus-last-label">⚡ ${lastLabel}</span>`;
      } else {
        btn.innerHTML = `<svg class="svg"><use xlink:href="#iconRefresh"></use></svg><span class="damophus-last-label">⚡ ${lastLabel}</span>`;
      }
    }
  });
}

export function setLastUsedSource(item: CoverSourceItem): void {
  memoryLastUsedSource = item;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LAST_USED_SOURCE_KEY, JSON.stringify(item));
    }
  } catch {}
  updateAllLastUsedButtons(item);
}

/**
 * ⚡「使用上次配置」实时化：快照里冻结的是上次使用时序列化的 URL，模板条件
 * 之后可能已经编辑过。按模板名在当前 sources 里取实时序列化结果，找到就用
 * 新的（并同步快照，按钮标签随之更新）；找不到（模板已删/自定义图源）才退
 * 回快照，再退回第一个模板。
 */
export function resolveFreshLastUsedSource(currentSources: readonly CoverSourceItem[]): CoverSourceItem | null {
  const fallback = currentSources[0] ?? null;
  const lastUsed = getLastUsedSource();
  if (!lastUsed) return fallback;
  const fresh = currentSources.find((source) => source.label === lastUsed.label && Boolean(source.url));
  if (!fresh) return lastUsed || fallback;
  if (fresh.url !== lastUsed.url) {
    setLastUsedSource(fresh);
  }
  return fresh;
}
