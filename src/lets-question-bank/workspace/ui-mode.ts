// Device-local workbench layout preference for the question bank. It decides
// whether the workbench renders the desktop UI, the mobile UI, or follows the
// panel width automatically. Must never travel with synced document data, so
// plain localStorage is the right home (same policy as fab-preferences).
export type QuestionBankUiMode = "auto" | "mobile" | "desktop";

const UI_MODE_KEY = "damophus-question-bank.ui-mode";

const VALID_MODES: readonly QuestionBankUiMode[] = ["auto", "mobile", "desktop"];

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadUiMode(): QuestionBankUiMode {
  const raw = store()?.getItem(UI_MODE_KEY);
  return VALID_MODES.includes(raw as QuestionBankUiMode) ? (raw as QuestionBankUiMode) : "auto";
}

export function saveUiMode(mode: QuestionBankUiMode): void {
  try {
    store()?.setItem(UI_MODE_KEY, mode);
  } catch {
    /* private-mode storage: keep the preference in memory only */
  }
}

export function cycleUiMode(mode: QuestionBankUiMode): QuestionBankUiMode {
  return mode === "auto" ? "mobile" : mode === "mobile" ? "desktop" : "auto";
}
