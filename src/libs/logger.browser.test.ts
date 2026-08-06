import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  vi.restoreAllMocks();
  window.__damophusLog?.reset();
});

describe("Damophus logger", () => {
  it("emits a visible confirmation as soon as debug logging is enabled", async () => {
    const loggerModule = await import("./logger");

    loggerModule.enableLogging(true);

    expect(loggerModule.getLogRecords()).toMatchObject([{
      level: "info",
      scope: "logging",
      args: ["debug logging enabled", { level: "debug" }],
    }]);
  });

  it("writes scoped consola messages to the browser console when enabled", async () => {
    const loggerModule = await import("./logger");
    loggerModule.setLogLevel("info");

    loggerModule.getLogger("question-bank.grading").info("answer graded", { questionId: "q1" });

    expect(loggerModule.getLogRecords()).toMatchObject([{
      level: "info",
      scope: "question-bank.grading",
      args: ["answer graded", { questionId: "q1" }],
    }]);
  });

  it("supports persistent global and per-scope levels through the runtime controller", async () => {
    const loggerModule = await import("./logger");
    const grading = loggerModule.getLogger("question-bank.grading");
    loggerModule.setLogLevel("silent");
    window.__damophusLog?.setScopeLevel("question-bank.grading", "debug");

    grading.debug("answer graded", { selected: ["B", "C"] });

    expect(window.localStorage.getItem(loggerModule.LOG_LEVEL_STORAGE_KEY)).toBe("silent");
    expect(JSON.parse(window.localStorage.getItem(loggerModule.LOG_SCOPE_STORAGE_KEY) ?? "{}")).toEqual({
      "question-bank.grading": "debug",
    });
    expect(window.__damophusLog?.getRecords()).toMatchObject([{
      level: "debug",
      scope: "question-bank.grading",
      args: ["answer graded", { selected: ["B", "C"] }],
    }]);
  });
});
