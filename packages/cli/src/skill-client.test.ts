import { afterEach, describe, expect, it, vi } from "vitest";
import { getSkill, listSkills } from "./skill-client";

afterEach(() => vi.unstubAllGlobals());

describe("SiYuan skill client", () => {
  it("normalizes an empty skill list returned as null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: 0, data: null }))));
    await expect(listSkills("http://127.0.0.1:6806")).resolves.toEqual([]);
  });

  it("retains the requested directory name when SiYuan returns only content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      code: 0,
      data: { content: "Skill body" },
    }))));
    await expect(getSkill("http://127.0.0.1:6806", "legal-marknote")).resolves.toEqual({
      name: "legal-marknote",
      content: "Skill body",
    });
  });
});
