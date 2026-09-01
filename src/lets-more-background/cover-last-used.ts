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
