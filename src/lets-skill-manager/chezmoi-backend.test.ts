import { describe, expect, it, vi } from "vitest";

import { buildChezmoiArguments, syncSkillsWithChezmoi } from "./chezmoi-backend";

const options = {
  command: "chezmoi",
  sourceRoot: "C:\\Users\\test\\.skills-manager\\skills",
  destinationRoot: "D:\\SiYuan\\data\\storage\\ai\\agent\\skills",
  skillNames: ["legal-marknote", "legal-goldquest"],
};

describe("ChezMoi skill synchronization", () => {
  it("forces file mode and addresses selected destination paths", () => {
    expect(buildChezmoiArguments("apply", options)).toEqual([
      "--source",
      options.sourceRoot,
      "--destination",
      options.destinationRoot,
      "--mode",
      "file",
      "--force",
      "--no-tty",
      "apply",
      `${options.destinationRoot}\\legal-marknote`,
      `${options.destinationRoot}\\legal-goldquest`,
    ]);
  });

  it("applies and then verifies the selected skills", async () => {
    const executor = vi.fn(async () => undefined);
    await syncSkillsWithChezmoi(options, executor);
    expect(executor).toHaveBeenCalledTimes(2);
    expect(executor.mock.calls[0]).toEqual(["chezmoi", buildChezmoiArguments("apply", options)]);
    expect(executor.mock.calls[1]).toEqual(["chezmoi", buildChezmoiArguments("verify", options)]);
  });

  it("does not invoke ChezMoi when no skills need synchronization", async () => {
    const executor = vi.fn(async () => undefined);
    await syncSkillsWithChezmoi({ ...options, skillNames: [] }, executor);
    expect(executor).not.toHaveBeenCalled();
  });

  it("reports apply and verify progress with command output", async () => {
    const onLog = vi.fn();
    const executor = vi.fn(async (_command: string, args: string[]) => ({
      stdout: args.includes("apply") ? "applied legal-marknote" : "",
      stderr: "",
    }));

    await syncSkillsWithChezmoi({ ...options, onLog }, executor);

    expect(onLog).toHaveBeenCalledWith(expect.objectContaining({
      level: "info",
      stage: "apply",
      message: "ChezMoi apply started",
    }));
    expect(onLog).toHaveBeenCalledWith(expect.objectContaining({
      level: "success",
      stage: "apply",
      detail: "applied legal-marknote",
    }));
    expect(onLog).toHaveBeenCalledWith(expect.objectContaining({
      level: "success",
      stage: "verify",
    }));
  });
});
