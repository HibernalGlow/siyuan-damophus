import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, tick, unmount } from "svelte";
import { page } from "vitest/browser";
import CoverTemplateConditionEditor from "./CoverTemplateConditionEditor.svelte";
import type { FilterRule } from "./sources";

let mounted: ReturnType<typeof mount> | undefined;

function label(_key: string, fallback: string): string {
  return fallback;
}

async function render(rules: FilterRule[], onApply = vi.fn()): Promise<typeof onApply> {
  const target = document.createElement("div");
  target.style.width = "100%";
  document.body.appendChild(target);
  mounted = mount(CoverTemplateConditionEditor, {
    target,
    props: {
      label,
      onApply,
      rules,
      tagPools: [{ id: "artists", name: "Artists", items: ["artist_a"] }],
    },
  });
  await tick();
  return onApply;
}

afterEach(async () => {
  if (mounted) await unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
  await page.viewport(1024, 768);
});

describe("cover template condition editor", () => {
  it("opens legacy template rules in the shared query builder", async () => {
    await render([
      { id: "ratio", field: "aspectRatio", operator: "equals", value: "landscape" },
      { id: "pool", field: "tagPool", operator: "randomIn", value: "artists" },
    ]);

    document.querySelector<HTMLButtonElement>(".condition-summary-trigger")!.click();
    await tick();

    const rules = [...document.querySelectorAll<HTMLElement>(".rule")].map((rule) => rule.innerText);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toContain("Aspect ratio");
    expect(rules[1]).toContain("Tag or artist pool");
    expect(document.querySelector(".ruleGroup-combinators")?.textContent).toContain("and");
    expect(document.querySelector(".ruleGroup-combinators")?.textContent).not.toContain("or");
  });

  it("clears the editor and applies the original flat rule contract", async () => {
    const onApply = await render([
      { id: "score", field: "minScore", operator: "gte", value: 10 },
    ]);
    document.querySelector<HTMLButtonElement>(".condition-summary-trigger")!.click();
    await tick();

    [...document.querySelectorAll<HTMLButtonElement>(".condition-dialog-footer button")]
      .find((button) => button.textContent?.includes("Clear rules"))
      ?.click();
    await tick();
    expect(document.querySelectorAll(".rule")).toHaveLength(0);

    [...document.querySelectorAll<HTMLButtonElement>(".condition-dialog-footer button")]
      .find((button) => button.textContent?.includes("Apply"))
      ?.click();
    await tick();
    expect(onApply).toHaveBeenCalledWith([]);
  });
});
