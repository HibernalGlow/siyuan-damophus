import { describe, expect, it, vi } from "vitest";
import { buildPracticeOverflowItems, type PracticeOverflowOptions } from "./practice-overflow-menu";
import { DEFAULT_PRACTICE_HEADER_ACTIONS } from "./practice-preferences";

const label = (_key: string, fallback: string): string => fallback;

function options(overrides: Partial<PracticeOverflowOptions> = {}): PracticeOverflowOptions {
  return {
    label,
    canLocate: true,
    canEditSource: true,
    sourceEditingLocked: true,
    canBookmark: true,
    hasBookmark: false,
    canCorrect: false,
    canToggleTimer: true,
    timerPaused: false,
    indefinitePracticeMode: false,
    pauseOnBlur: false,
    showStemStyles: false,
    showStemTags: true,
    headerActions: { ...DEFAULT_PRACTICE_HEADER_ACTIONS },
    onLocate: vi.fn(),
    onToggleSourceEditingLock: vi.fn(),
    onBookmarkDetail: vi.fn(),
    onCorrect: vi.fn(),
    onToggleTimer: vi.fn(),
    onToggleIndefinitePracticeMode: vi.fn(),
    onTogglePauseOnBlur: vi.fn(),
    onToggleStemStyles: vi.fn(),
    onToggleStemTags: vi.fn(),
    onToggleHeaderAction: vi.fn(),
    ...overrides,
  };
}

const submenu = (items: ReturnType<typeof buildPracticeOverflowItems>, labelText: string) =>
  items.find((item) => item.label === labelText)?.submenu ?? [];

describe("practice overflow menu", () => {
  it("lists every feature above the display submenus so hidden buttons stay usable", () => {
    const items = buildPracticeOverflowItems(options({
      headerActions: { ...DEFAULT_PRACTICE_HEADER_ACTIONS, locate: false, lock: false, bookmark: false, timer: false },
    }));

    expect(items.slice(0, 5).map((item) => item.label)).toEqual([
      "Open source in SiYuan",
      "Unlock source editing",
      "收藏并添加批注",
      "Pause timer",
      "Indefinite practice mode（已关闭）",
    ]);
    expect(items[5].label).toBe("Pause timer on blur（已关闭）");
    expect(items[6].label).toBe("Hide rules");
    expect(items[7].label).toBe("Header buttons");
  });

  it("omits unavailable features and adds the correction row only after reveal", () => {
    expect(buildPracticeOverflowItems(options({
      canLocate: false,
      canEditSource: false,
      canBookmark: false,
      canToggleTimer: false,
    })).map((item) => item.label)).toEqual([
      "Indefinite practice mode（已关闭）",
      "Pause timer on blur（已关闭）",
      "Hide rules",
      "Header buttons",
    ]);

    const revealed = buildPracticeOverflowItems(options({ canCorrect: true }));
    expect(revealed.map((item) => item.label)).toContain("Correct answer");
    revealed.find((item) => item.label === "Correct answer")?.click?.();
    expect(revealed.length).toBe(9);
  });

  it("keeps display rules and header buttons in their own submenus", () => {
    const items = buildPracticeOverflowItems(options({ showStemStyles: false, showStemTags: true }));

    expect(submenu(items, "Hide rules").map((item) => item.label)).toEqual([
      "Show question styles（已隐藏）",
      "Topic tags（已显示）",
    ]);
    expect(submenu(items, "Header buttons").map((item) => item.label)).toEqual([
      "Open source in SiYuan（已显示）",
      "Lock source editing（已显示）",
      "Bookmark（已显示）",
      "Correct answer（已显示）",
      "Answer timer（已显示）",
    ]);
  });

  it("routes each row to its own handler", () => {
    const overrides = options();
    const items = buildPracticeOverflowItems(overrides);

    items[0].click?.();
    expect(overrides.onLocate).toHaveBeenCalledOnce();
    submenu(items, "Hide rules")[1].click?.();
    expect(overrides.onToggleStemTags).toHaveBeenCalledOnce();
    submenu(items, "Header buttons")[4].click?.();
    expect(overrides.onToggleHeaderAction).toHaveBeenCalledWith("timer");
  });
});
