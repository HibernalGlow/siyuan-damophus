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

  it("silences leftover scope overrides and persisted state when the master switch turns off", async () => {
    const loggerModule = await import("./logger");
    loggerModule.setLogLevel("debug");
    window.__damophusLog?.setScopeLevel("lets-more-background", "debug");
    const background = loggerModule.getLogger("lets-more-background");

    loggerModule.enableLogging(false);

    background.debug("restore position: attrs received", { blockId: "b1" });
    expect(window.__damophusLog?.getRecords()).toEqual([]);
    expect(loggerModule.getLogLevel()).toBe("silent");
    expect(window.__damophusLog?.getScopeLevels()).toEqual({});
    expect(window.localStorage.getItem(loggerModule.LOG_LEVEL_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(loggerModule.LOG_SCOPE_STORAGE_KEY)).toBeNull();
  });
});
