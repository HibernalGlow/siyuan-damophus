import type { PracticeHeaderAction, PracticeHeaderActions } from "./practice-preferences";

/** A menu entry shaped like SiYuan's `IMenu`, kept local so the builder stays testable. */
export interface PracticeOverflowItem {
  icon?: string;
  label: string;
  type?: "submenu";
  submenu?: PracticeOverflowItem[];
  click?: () => void;
}

export interface PracticeOverflowOptions {
  label: (key: string, fallback: string) => string;
  canLocate: boolean;
  canEditSource: boolean;
  sourceEditingLocked: boolean;
  canBookmark: boolean;
  hasBookmark: boolean;
  canCorrect: boolean;
  canToggleTimer: boolean;
  timerPaused: boolean;
  indefinitePracticeMode: boolean;
  pauseOnBlur: boolean;
  showStemStyles: boolean;
  showStemTags: boolean;
  headerActions: PracticeHeaderActions;
  onLocate: () => void;
  onToggleSourceEditingLock: () => void;
  onBookmarkDetail: () => void;
  onCorrect: () => void;
  onToggleTimer: () => void;
  onToggleIndefinitePracticeMode: () => void;
  onTogglePauseOnBlur: () => void;
  onToggleStemStyles: () => void;
  onToggleStemTags: () => void;
  onToggleHeaderAction: (action: PracticeHeaderAction) => void;
}

const HEADER_ACTION_LABELS: Array<[PracticeHeaderAction, string, string]> = [
  ["locate", "openSource", "Open source in SiYuan"],
  ["lock", "lockSourceEditing", "Lock source editing"],
  ["bookmark", "bookmark", "Bookmark"],
  ["correct", "correctAnswer", "Correct answer"],
  ["timer", "answerTimer", "Answer timer"],
];

const shown = (visible: boolean): string => (visible ? "已显示" : "已隐藏");
const on = (enabled: boolean): string => (enabled ? "已开启" : "已关闭");

/**
 * The practice overflow menu. Feature rows stay listed even when their top-bar button is
 * hidden, so hiding a button never hides the action itself; the two submenus only decide
 * display, not capability.
 */
export function buildPracticeOverflowItems(options: PracticeOverflowOptions): PracticeOverflowItem[] {
  const { label } = options;
  const items: PracticeOverflowItem[] = [];

  if (options.canLocate) {
    items.push({ icon: "iconFocus", label: label("openSource", "Open source in SiYuan"), click: options.onLocate });
  }
  if (options.canEditSource) {
    items.push({
      icon: options.sourceEditingLocked ? "iconUnlock" : "iconLock",
      label: options.sourceEditingLocked
        ? label("unlockSourceEditing", "Unlock source editing")
        : label("lockSourceEditing", "Lock source editing"),
      click: options.onToggleSourceEditingLock,
    });
  }
  if (options.canBookmark) {
    items.push({
      icon: "iconStar",
      label: options.hasBookmark
        ? label("editBookmarkNote", "编辑收藏与批注")
        : label("bookmarkWithNote", "收藏并添加批注"),
      click: options.onBookmarkDetail,
    });
  }
  if (options.canCorrect) {
    items.push({ icon: "iconEdit", label: label("correctAnswer", "Correct answer"), click: options.onCorrect });
  }
  if (options.canToggleTimer) {
    items.push({
      icon: options.timerPaused ? "iconPlay" : "iconPause",
      label: options.timerPaused ? label("resumeTimer", "Resume timer") : label("pauseTimer", "Pause timer"),
      click: options.onToggleTimer,
    });
  }

  items.push({
    icon: options.indefinitePracticeMode ? "iconCheck" : "iconUncheck",
    label: `${label("indefinitePracticeMode", "Indefinite practice mode")}（${on(options.indefinitePracticeMode)}）`,
    click: options.onToggleIndefinitePracticeMode,
  });
  items.push({
    icon: options.pauseOnBlur ? "iconCheck" : "iconUncheck",
    label: `${label("pauseOnBlur", "Pause timer on blur")}（${on(options.pauseOnBlur)}）`,
    click: options.onTogglePauseOnBlur,
  });

  items.push({
    type: "submenu",
    icon: "iconEye",
    label: label("hideRules", "Hide rules"),
    submenu: [
      {
        icon: options.showStemStyles ? "iconUncheck" : "iconCheck",
        label: `${label("showStemStyles", "Show question styles")}（${shown(options.showStemStyles)}）`,
        click: options.onToggleStemStyles,
      },
      {
        icon: options.showStemTags ? "iconCheck" : "iconUncheck",
        label: `${label("stemTags", "Topic tags")}（${shown(options.showStemTags)}）`,
        click: options.onToggleStemTags,
      },
    ],
  });

  items.push({
    type: "submenu",
    icon: "iconSettings",
    label: label("headerActions", "Header buttons"),
    submenu: HEADER_ACTION_LABELS.map(([action, key, fallback]) => ({
      icon: options.headerActions[action] ? "iconCheck" : "iconUncheck",
      label: `${label(key, fallback)}（${shown(options.headerActions[action])}）`,
      click: () => options.onToggleHeaderAction(action),
    })),
  });

  return items;
}
