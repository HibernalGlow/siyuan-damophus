import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, tick, unmount } from "svelte";
import { page } from "vitest/browser";
import CoverTemplateConditionEditor from "./CoverTemplateConditionEditor.svelte";
import { migrateLegacyCoverRules, type CoverConditionGroup } from "./sources";

let mounted: ReturnType<typeof mount> | undefined;

function label(_key: string, fallback: string): string {
  return fallback;
}

async function render(condition: CoverConditionGroup, onApply = vi.fn()): Promise<typeof onApply> {
  const target = document.createElement("div");
  target.style.width = "100%";
  document.body.appendChild(target);
  mounted = mount(CoverTemplateConditionEditor, {
    target,
    props: {
      label,
      onApply,
      condition,
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
  it("opens migrated template conditions in the shared query builder", async () => {
    await render(migrateLegacyCoverRules([
      { id: "ratio", field: "aspectRatio", operator: "equals", value: "landscape" },
      { id: "pool", field: "tagPool", operator: "randomIn", value: "artists" },
    ]));

    document.querySelector<HTMLButtonElement>(".condition-summary-trigger")!.click();
    await tick();

    const rules = [...document.querySelectorAll<HTMLElement>(".rule")].map((rule) => rule.innerText);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toContain("Aspect ratio");
    expect(rules[1]).toContain("Tag or artist pool");
    // The add-group action is back: visible, labelled and distinct from add-rule.
    const addGroup = document.querySelector<HTMLButtonElement>(".ruleGroup-addGroup")!;
    expect(getComputedStyle(addGroup).display).not.toBe("none");
    expect(addGroup.textContent).toContain("Add group");
    expect(document.querySelector<HTMLButtonElement>(".ruleGroup-addRule")?.textContent).toContain("Add filter rule");
    const clearButton = document.querySelector<HTMLButtonElement>(".condition-clear-button")!;
    const cancelButton = document.querySelector<HTMLButtonElement>(".condition-cancel-button")!;
    const applyButton = document.querySelector<HTMLButtonElement>(".condition-apply-button")!;
    expect(getComputedStyle(clearButton).color).toBe(getComputedStyle(cancelButton).color);
    expect(getComputedStyle(applyButton).backgroundColor).not.toBe(getComputedStyle(cancelButton).backgroundColor);
    expect(getComputedStyle(applyButton.querySelector("svg")!).color).toBe(getComputedStyle(applyButton).color);
  });

  it("adds a group and applies the tree back to the template", async () => {
    const onApply = await render(migrateLegacyCoverRules([
      { id: "score", field: "minScore", operator: "gte", value: 10 },
    ]));
    document.querySelector<HTMLButtonElement>(".condition-summary-trigger")!.click();
    await tick();

    document.querySelector<HTMLButtonElement>(".ruleGroup-addGroup")!.click();
    await tick();
    expect(document.querySelectorAll(".ruleGroup").length).toBeGreaterThanOrEqual(2);

    [...document.querySelectorAll<HTMLButtonElement>(".condition-dialog-footer button")]
      .find((button) => button.textContent?.includes("Apply"))
      ?.click();
    await tick();
    expect(onApply).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0][0] as CoverConditionGroup;
    expect(applied.combinator).toBe("and");
    expect(applied.rules).toHaveLength(2);
    // The nested group stays in the tree: the template keeps the grouping.
    expect("rules" in applied.rules[1]).toBe(true);
  });

  it("toggles Not on the root group and applies it to the template", async () => {
    const onApply = await render(migrateLegacyCoverRules([
      { id: "score", field: "minScore", operator: "gte", value: 10 },
    ]));
    document.querySelector<HTMLButtonElement>(".condition-summary-trigger")!.click();
    await tick();

    const notInput = document.querySelector<HTMLInputElement>(".ruleGroup input[type=\"checkbox\"]")!;
    expect(notInput.checked).toBe(false);
    notInput.click();
    await tick();

    [...document.querySelectorAll<HTMLButtonElement>(".condition-dialog-footer button")]
      .find((button) => button.textContent?.includes("Apply"))
      ?.click();
    await tick();
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toMatchObject({ combinator: "and", not: true });
  });

  it("keeps an or/not tree intact when editing and re-applying", async () => {
    const onApply = await render({
      combinator: "or",
      not: true,
      rules: [
        { field: "minScore", operator: "gte", value: 10 },
        { field: "rating", operator: "equals", value: "safe" },
      ],
    });
    document.querySelector<HTMLButtonElement>(".condition-summary-trigger")!.click();
    await tick();

    // The saved 与/或/非 structure round-trips through the shared builder.
    expect(document.querySelector(".ruleGroup-combinators")?.textContent).toContain("or");
    expect(document.querySelector<HTMLInputElement>(".ruleGroup input[type=\"checkbox\"]")!.checked).toBe(true);

    [...document.querySelectorAll<HTMLButtonElement>(".condition-dialog-footer button")]
      .find((button) => button.textContent?.includes("Apply"))
      ?.click();
    await tick();
    expect(onApply).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0][0] as CoverConditionGroup;
    expect(applied.combinator).toBe("or");
    expect(applied.not).toBe(true);
    expect(applied.rules).toHaveLength(2);
  });

  // [条件图形视图-暂停维护] it("shows the condition graph view with a result node", async () => {
  //   await render(migrateLegacyCoverRules([
  //     { id: "ratio", field: "aspectRatio", operator: "equals", value: "landscape" },
  //   ]));
  //   document.querySelector<HTMLButtonElement>(".condition-summary-trigger")!.click();
  //   await tick();
  //
  //   document.querySelector<HTMLButtonElement>('[data-testid="condition-view-graph"]')!.click();
  //   await tick();
  //   await vi.waitFor(() => expect(document.querySelectorAll(".svelte-flow__node").length).toBeGreaterThanOrEqual(3));
  //
  //   const nodes = [...document.querySelectorAll<HTMLElement>(".svelte-flow__node")].map((node) => node.textContent ?? "");
  //   expect(nodes.some((text) => text.includes("Aspect ratio"))).toBe(true);
  //   // Rule nodes inherit their field's glyph (Ratio icon for aspect ratio).
  //   expect(document.querySelector(".svelte-flow__node svg.lucide-ratio")).not.toBeNull();
  // });

  it("clears the editor and applies the empty condition", async () => {
    const onApply = await render(migrateLegacyCoverRules([
      { id: "score", field: "minScore", operator: "gte", value: 10 },
    ]));
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
    // The builder stamps its own group id, so match on the contract shape.
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ combinator: "and", rules: [] }));
  });
});
