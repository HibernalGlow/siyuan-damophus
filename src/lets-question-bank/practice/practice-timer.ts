import type { PracticeSessionRuntime } from "@/question-bank/application";

/**
 * Live view of the component state the practice timer interacts with. The
 * auto-pause flags live in this module's closure; consumers use
 * `isAutoPaused` / `clearAutoPaused` instead.
 */
export interface PracticeTimerState {
  timerNow: number;
  timingEnabled: boolean;
  pauseOnBlur: boolean;
  practiceRuntime: PracticeSessionRuntime | undefined;
  submitting: boolean;
  reviewing: boolean;
  answerTimerPaused: boolean;
  rootElement: HTMLElement | undefined;
}

export function createPracticeTimer(deps: {
  state: PracticeTimerState;
  now: () => number;
}) {
  const state = deps.state;
  let timer: ReturnType<typeof setInterval> | undefined;
  // Two distinct auto-pause sources need distinct resume rules: a window-blur
  // pause resumes as soon as the window is focused again (returning via Alt-Tab,
  // taskbar or the title bar produces no pointer event, and document.activeElement
  // is unreliable at that moment), while a pointer pause outside the question
  // bank waits for the user to click back into the question bank.
  let autoPausedByWindowBlur = false;
  let autoPausedByOutsidePointer = false;

  function isTargetInsideQuestionBank(target: EventTarget | null): boolean {
    if (!target || !(target instanceof Node)) return false;
    if (state.rootElement && state.rootElement.contains(target)) return true;
    if (target instanceof Element) {
      if (target.closest(".damophus-question-bank-host, .b3-menu, .b3-dialog, .protyle-util, .correction-dialog, [data-testid='question-bank']")) {
        return true;
      }
    }
    return false;
  }

  function handleFocusOrPointer(target: EventTarget | null): void {
    if (!state.pauseOnBlur || !state.practiceRuntime || state.submitting || state.reviewing) return;
    const current = state.practiceRuntime.actor.getSnapshot();
    if (!current.matches("active")) return;

    const inside = isTargetInsideQuestionBank(target);
    if (inside) {
      if ((autoPausedByWindowBlur || autoPausedByOutsidePointer) && current.context.timerPaused) {
        state.practiceRuntime.actor.send({ type: "RESUME_TIMER", now: deps.now() });
        startTimer();
      }
      autoPausedByWindowBlur = false;
      autoPausedByOutsidePointer = false;
    } else {
      if (!current.context.timerPaused && !state.answerTimerPaused) {
        state.practiceRuntime.actor.send({ type: "PAUSE_TIMER", now: deps.now() });
        clearTimer();
        autoPausedByOutsidePointer = true;
      }
    }
  }

  function handleWindowBlur(): void {
    if (!state.pauseOnBlur || !state.practiceRuntime || state.submitting || state.reviewing) return;
    const current = state.practiceRuntime.actor.getSnapshot();
    if (!current.matches("active")) return;
    if (!current.context.timerPaused && !state.answerTimerPaused) {
      state.practiceRuntime.actor.send({ type: "PAUSE_TIMER", now: deps.now() });
      clearTimer();
      autoPausedByWindowBlur = true;
    }
  }

  function handleWindowFocus(): void {
    if (!state.pauseOnBlur || !state.practiceRuntime || state.submitting || state.reviewing) return;
    const current = state.practiceRuntime.actor.getSnapshot();
    if (!current.matches("active")) return;
    if (autoPausedByWindowBlur) {
      if (current.context.timerPaused) {
        state.practiceRuntime.actor.send({ type: "RESUME_TIMER", now: deps.now() });
        startTimer();
      }
      autoPausedByWindowBlur = false;
    }
  }

  function handleVisibilityChange(): void {
    if (document.hidden) {
      handleWindowBlur();
    } else {
      handleWindowFocus();
    }
  }

  function clearTimer(): void {
    if (timer) clearInterval(timer);
    timer = undefined;
  }

  function startTimer(): void {
    clearTimer();
    state.timerNow = deps.now();
    if (!state.timingEnabled) return;
    timer = setInterval(() => {
      state.timerNow = deps.now();
    }, 1000);
  }

  function togglePracticeTimer(): void {
    if (!state.practiceRuntime || state.submitting || state.reviewing) return;
    const current = state.practiceRuntime.actor.getSnapshot();
    if (!current.matches("active")) return;
    autoPausedByWindowBlur = false;
    autoPausedByOutsidePointer = false;
    if (!current.context.timerPaused) {
      state.practiceRuntime.actor.send({ type: "PAUSE_TIMER", now: deps.now() });
      clearTimer();
    } else {
      state.practiceRuntime.actor.send({ type: "RESUME_TIMER", now: deps.now() });
      startTimer();
    }
  }

  function isAutoPaused(): boolean {
    return autoPausedByWindowBlur || autoPausedByOutsidePointer;
  }

  function clearAutoPaused(): void {
    autoPausedByWindowBlur = false;
    autoPausedByOutsidePointer = false;
  }

  return {
    isTargetInsideQuestionBank,
    handleFocusOrPointer,
    handleWindowBlur,
    handleWindowFocus,
    handleVisibilityChange,
    clearTimer,
    startTimer,
    togglePracticeTimer,
    isAutoPaused,
    clearAutoPaused,
  };
}
