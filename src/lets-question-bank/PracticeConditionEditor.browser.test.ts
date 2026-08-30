import { afterEach, describe, expect, it } from "vitest";
import { mount, tick, unmount } from "svelte";
import { page } from "vitest/browser";
import type { PracticeFilter } from "@/question-bank/core/scope";
import { en } from "@/translations/parts/lets-question-bank";
import PracticeConditionEditor from "./PracticeConditionEditor.svelte";

let mounted: ReturnType<typeof mount> | undefined;

function translation(source: Record<string, string>) {
  return (key: string, fallback: string) => source[`lets-question-bank.${key}`] ?? fallback;
}

async function render(filter: PracticeFilter) {
  const target = document.createElement("div");
  target.style.width = "100%";
  document.body.appendChild(target);
  mounted = mount(PracticeConditionEditor, {
    target,
    props: { filter, label: translation(en) },
  });
  await tick();
}

afterEach(async () => {
  if (mounted) await unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
  await page.viewport(1024, 768);
});

describe("practice condition editor", () => {
  it("renders a bookmarked but not wrong condition in the query builder", async () => {
    await render({
      glue: "and",
      rules: [
        { field: "bookmarked", type: "tuple", filter: "equal", value: "yes" },
        { field: "wrong", type: "tuple", filter: "equal", value: "no" },
      ],
    });

    expect(document.querySelector(".condition-summary-copy")?.textContent).toContain("Bookmarked");
    expect(document.querySelector(".condition-summary-copy")?.textContent).toContain("and");
    expect(document.querySelector(".condition-summary-trigger")?.getAttribute("title")).toContain("Not wrong");
    document.querySelector<HTMLButtonElement>(".condition-summary-trigger")!.click();
    await tick();
    const rules = [...document.querySelectorAll<HTMLElement>(".rule")].map((item) => item.innerText);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toContain("Bookmark status");
    expect(rules[0]).toContain("Bookmarked");
    expect(rules[1]).toContain("Wrong-answer status");
    expect(rules[1]).toContain("Not wrong");
    expect(document.querySelector(".rule-fields svg")).not.toBeNull();
    expect(document.querySelector(".rule-value svg")).not.toBeNull();
    expect(document.querySelector(".ruleGroup-combinators")?.textContent).toContain("and");
  });

  it("migrates a legacy filter and clears it from the editor", async () => {
    await render("review");
    document.querySelector<HTMLButtonElement>(".condition-summary-trigger")!.click();
    await tick();
    expect(document.querySelector(".rule")?.textContent).toContain("Needs review");

    document.querySelector<HTMLButtonElement>('button[aria-label="Clear conditions"]')!.click();
    await tick();

    expect(document.querySelectorAll(".rule")).toHaveLength(0);
  });

  it("opens the rule editor when adding the first condition", async () => {
    await render("all");

    document.querySelector<HTMLButtonElement>(".condition-summary-trigger")!.click();
    await tick();
    const addButton = document.querySelector<HTMLButtonElement>(".ruleGroup-addRule");
    expect(addButton).toBeDefined();
    expect(addButton?.querySelector("svg")).not.toBeNull();
    expect(addButton?.textContent?.trim()).toBe("Add condition");

    addButton!.click();
    await tick();

    expect(document.querySelector(".rule")).not.toBeNull();
    expect(document.querySelector(".rule")?.textContent).toContain("Attempt status");

    await new Promise((resolve) => setTimeout(resolve, 10));
    const applyButton = [...document.querySelectorAll<HTMLButtonElement>(".condition-dialog-footer button")].find((button) =>
      button.textContent?.includes("Apply"),
    );
    applyButton?.click();
    await tick();
    expect(document.querySelector(".condition-summary-copy")?.textContent).toContain("Attempted");
  });

  it("cancels an edit and reopens the saved condition", async () => {
    await render({
      glue: "and",
      rules: [{ field: "bookmarked", type: "tuple", filter: "equal", value: "yes" }],
    });

    document.querySelector<HTMLButtonElement>(".condition-summary-trigger")!.click();
    await tick();
    const valueSelect = document.querySelector<HTMLButtonElement>(".rule-value")!;
    expect(valueSelect).toBeInstanceOf(HTMLButtonElement);
    expect(valueSelect.textContent).toContain("Bookmarked");
    valueSelect.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", pointerId: 1, buttons: 1 }));
    await tick();
    [...document.querySelectorAll<HTMLElement>('[data-slot="select-item"]')]
      .find((item) => item.textContent?.includes("Not bookmarked"))
      ?.click();
    await tick();
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Cancel"))
      ?.click();
    await tick();

    expect(document.querySelector(".condition-summary-copy")?.textContent).toContain("Bookmarked");
    document.querySelector<HTMLButtonElement>(".condition-summary-trigger")!.click();
    await tick();
    expect(document.querySelector<HTMLButtonElement>(".rule-value")?.textContent).toContain("Bookmarked");
  });

  it("adds a nested group and keeps it available for naming", async () => {
    await render("all");
    document.querySelector<HTMLButtonElement>(".condition-summary-trigger")!.click();
    await tick();

    document.querySelector<HTMLButtonElement>(".ruleGroup-addGroup")!.click();
    await tick();

    expect(document.querySelectorAll(".ruleGroup")).toHaveLength(2);
    expect(document.querySelectorAll(".condition-group-name-row")).toHaveLength(2);
    const addRuleButtons = document.querySelectorAll<HTMLButtonElement>(".ruleGroup-addRule");
    addRuleButtons[1].click();
    await tick();
    expect(document.querySelectorAll(".rule")).toHaveLength(1);
  });

  it("renames a condition group and shows only its name in the summary", async () => {
    await render({
      glue: "and",
      rules: [{ field: "bookmarked", type: "tuple", filter: "equal", value: "yes" }],
    });

    document.querySelector<HTMLButtonElement>(".condition-summary-trigger")!.click();
    await tick();
    const nameInput = document.querySelector<HTMLInputElement>(".condition-group-name-row input")!;
    nameInput.value = "Saved favorites";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    [...document.querySelectorAll<HTMLButtonElement>(".condition-dialog-footer button")]
      .find((button) => button.textContent?.includes("Apply"))
      ?.click();
    await tick();

    expect(document.querySelector(".condition-summary-copy small")?.textContent).toBe("Saved favorites");
    expect(document.querySelector(".condition-summary-trigger")?.getAttribute("title")).toBe("Saved favorites");

    document.querySelector<HTMLButtonElement>(".condition-summary-trigger")!.click();
    await tick();
    const savedNameInput = document.querySelector<HTMLInputElement>(".condition-group-name-row input")!;
    expect(savedNameInput.value).toBe("Saved favorites");
    savedNameInput.value = "";
    savedNameInput.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    [...document.querySelectorAll<HTMLButtonElement>(".condition-dialog-footer button")]
      .find((button) => button.textContent?.includes("Apply"))
      ?.click();
    await tick();

    expect(document.querySelector(".condition-summary-copy small")?.textContent).toBe("Bookmarked");
  });

  it("renders the demo editing controls for independent combinators", async () => {
    await render({
      glue: "and",
      combinators: ["and", "or"],
      rules: [
        { field: "bookmarked", filter: "equal", value: "yes" },
        { field: "wrong", filter: "equal", value: "yes" },
        { field: "review", filter: "equal", value: "yes" },
      ],
    });
    document.querySelector<HTMLButtonElement>(".condition-summary-trigger")!.click();
    await tick();
    expect(document.querySelectorAll(".rule")).toHaveLength(3);
    expect(document.querySelectorAll(".betweenRules")).toHaveLength(2);
    expect(document.querySelector(".ruleGroup-notToggle")).not.toBeNull();
    expect(document.querySelector(".rule-cloneRule")).not.toBeNull();
    expect(document.querySelector(".rule-lock")).not.toBeNull();
    expect(document.querySelector(".shiftActions")).not.toBeNull();
    expect(document.querySelector(".undoRedoActions")).not.toBeNull();
  });

  it("uses the same floating select menu on mobile instead of a native picker", async () => {
    await page.viewport(390, 844);
    await render({
      glue: "and",
      rules: [{ field: "bookmarked", type: "tuple", filter: "equal", value: "yes" }],
    });
    document.querySelector<HTMLButtonElement>(".condition-summary-trigger")!.click();
    await tick();

    const fieldTrigger = document.querySelector<HTMLButtonElement>(".rule-fields")!;
    expect(fieldTrigger).toBeInstanceOf(HTMLButtonElement);
    expect(document.querySelector(".condition-dialog select")).toBeNull();
    fieldTrigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", pointerId: 1, buttons: 1 }));
    await tick();
    expect(fieldTrigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(fieldTrigger.getAttribute("data-state")).toBe("closed");
  });
});
