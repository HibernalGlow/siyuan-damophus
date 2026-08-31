import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount, tick, unmount } from "svelte";
import { page } from "vitest/browser";
import type { PracticeFilter } from "@/question-bank/core/scope";
import { en } from "@/translations/parts/lets-question-bank";
import PracticeConditionEditor from "./PracticeConditionEditor.svelte";

let mounted: ReturnType<typeof mount> | undefined;

function translation(source: Record<string, string>) {
  return (key: string, fallback: string) => source[`lets-question-bank.${key}`] ?? fallback;
}

async function render(filter: PracticeFilter, width = "100%") {
  const target = document.createElement("div");
  target.style.width = width;
  document.body.appendChild(target);
  mounted = mount(PracticeConditionEditor, {
    target,
    props: { filter, label: translation(en) },
  });
  await tick();
}

/** Narrow hosts remove the summary row, so tests there open the editor through its exported entry points. */
function openEditorProgrammatically(): void {
  (mounted as unknown as { openNewCondition(): void }).openNewCondition();
}

beforeEach(async () => {
  // The browser keeps the previous test's viewport; desktop is the default here.
  await page.viewport(1024, 768);
});

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

    openEditorProgrammatically();
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
    openEditorProgrammatically();
    await tick();
    expect(document.querySelector(".rule")?.textContent).toContain("Needs review");

    [...document.querySelectorAll<HTMLButtonElement>(".condition-dialog-footer button")]
      .find((button) => button.textContent?.includes("Clear conditions"))
      ?.click();
    await tick();

    expect(document.querySelectorAll(".rule")).toHaveLength(0);
  });

  it("opens the rule editor when adding the first condition", async () => {
    await render("all");

    openEditorProgrammatically();
    await tick();
    const addButton = document.querySelector<HTMLButtonElement>(".ruleGroup-addRule");
    expect(addButton).toBeDefined();
    expect(addButton?.querySelector("svg")).not.toBeNull();
    expect(addButton?.querySelector(".action-label")?.textContent?.trim()).toBe("Add condition");

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
    openEditorProgrammatically();
    await tick();
    expect(document.querySelector(".rule")?.textContent).toContain("Attempt status");
  });

  it("cancels an edit and reopens the saved condition", async () => {
    await render({
      glue: "and",
      rules: [{ field: "bookmarked", type: "tuple", filter: "equal", value: "yes" }],
    });

    openEditorProgrammatically();
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

    openEditorProgrammatically();
    await tick();
    expect(document.querySelector<HTMLButtonElement>(".rule-value")?.textContent).toContain("Bookmarked");
  });

  it("adds a nested group and keeps it available for naming", async () => {
    await render("all");
    openEditorProgrammatically();
    await tick();

    document.querySelector<HTMLButtonElement>(".ruleGroup-addGroup")!.click();
    await tick();

    expect(document.querySelectorAll(".ruleGroup")).toHaveLength(2);
    // Unnamed groups show a ghost tag instead of reserving a name row.
    expect(document.querySelectorAll(".practice-rule-group .rule-group-name-add")).toHaveLength(2);
    const addRuleButtons = document.querySelectorAll<HTMLButtonElement>(".ruleGroup-addRule");
    addRuleButtons[1].click();
    await tick();
    expect(document.querySelectorAll(".rule")).toHaveLength(1);

    // Tapping the ghost tag grows it into the group name input.
    document.querySelector<HTMLButtonElement>(".practice-rule-group .rule-group-name-add")!.click();
    await tick();
    expect(document.querySelector<HTMLInputElement>(".practice-rule-group input.rule-group-name")).not.toBeNull();
  });

  it("renames a condition group and keeps the name across reopen", async () => {
    await render({
      glue: "and",
      rules: [{ field: "bookmarked", type: "tuple", filter: "equal", value: "yes" }],
    });

    openEditorProgrammatically();
    await tick();
    document.querySelector<HTMLButtonElement>(".practice-rule-group .rule-group-name-add")!.click();
    await tick();
    const nameInput = document.querySelector<HTMLInputElement>(".practice-rule-group input.rule-group-name")!;
    nameInput.value = "Saved favorites";
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    [...document.querySelectorAll<HTMLButtonElement>(".condition-dialog-footer button")]
      .find((button) => button.textContent?.includes("Apply"))
      ?.click();
    await tick();

    openEditorProgrammatically();
    await tick();
    const savedNameInput = document.querySelector<HTMLInputElement>(".practice-rule-group input.rule-group-name")!;
    expect(savedNameInput.value).toBe("Saved favorites");
    savedNameInput.value = "";
    savedNameInput.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    [...document.querySelectorAll<HTMLButtonElement>(".condition-dialog-footer button")]
      .find((button) => button.textContent?.includes("Apply"))
      ?.click();
    await tick();

    openEditorProgrammatically();
    await tick();
    // Clearing the name collapses the tag back to the ghost button.
    expect(document.querySelector(".practice-rule-group input.rule-group-name")).toBeNull();
    expect(document.querySelector(".practice-rule-group .rule-group-name-add")).not.toBeNull();
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
    openEditorProgrammatically();
    await tick();
    expect(document.querySelectorAll(".rule")).toHaveLength(3);
    expect(document.querySelectorAll(".betweenRules")).toHaveLength(2);
    expect(document.querySelector(".ruleGroup-notToggle")).not.toBeNull();
    expect(document.querySelector(".rule-cloneRule")).not.toBeNull();
    expect(document.querySelector(".rule-lock")).not.toBeNull();
    expect(document.querySelector(".shiftActions")).not.toBeNull();
    expect(document.querySelector(".undoRedoActions")).not.toBeNull();
  });

  it("switches to a graph view with explicit logic nodes", async () => {
    await render({
      glue: "and",
      combinators: ["and", "or"],
      rules: [
        { field: "bookmarked", filter: "equal", value: "yes" },
        { field: "wrong", filter: "equal", value: "yes" },
        { field: "review", filter: "equal", value: "yes" },
      ],
    });
    openEditorProgrammatically();
    await tick();
    document.querySelector<HTMLButtonElement>('[data-testid="condition-view-graph"]')!.click();
    await tick();

    expect(document.querySelector('[data-testid="condition-graph"]')).not.toBeNull();
    expect(document.querySelectorAll('.condition-graph-node[data-kind="rule"]')).toHaveLength(3);
    expect(document.querySelectorAll('.condition-graph-node[data-kind="logic"]')).toHaveLength(2);
    expect(document.querySelector('.condition-graph-node[data-kind="logic"]')?.textContent?.toLocaleLowerCase()).toMatch(/and|or/);
    expect(document.querySelector('.condition-graph-node[data-kind="result"]')?.textContent).toContain("Questions");

    document.querySelector<HTMLButtonElement>('[data-testid="condition-view-list"]')!.click();
    await tick();
    expect(document.querySelector(".query-builder-theme")).not.toBeNull();
  });

  it("edits a selected rule from the graph inspector", async () => {
    await render({ glue: "and", rules: [{ field: "bookmarked", filter: "equal", value: "yes" }] });
    openEditorProgrammatically();
    await tick();
    document.querySelector<HTMLButtonElement>('[data-testid="condition-view-graph"]')!.click();
    await tick();
    document.querySelector<HTMLElement>('.condition-graph-node[data-node-id="root-rule-0"]')!.click();
    await tick();

    const valueSelect = document.querySelectorAll<HTMLSelectElement>('[data-testid="condition-graph-inspector"] select')[2];
    valueSelect.value = "no";
    valueSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(document.querySelector('.condition-graph-node[data-node-id="root-rule-0"]')?.textContent).toContain("equals");
    expect(document.querySelector('.condition-graph-node[data-node-id="root-rule-0"]')?.textContent).toContain("Not bookmarked");
  });

  it("uses the same floating select menu on mobile instead of a native picker", async () => {
    await page.viewport(390, 844);
    await render({
      glue: "and",
      rules: [{ field: "bookmarked", type: "tuple", filter: "equal", value: "yes" }],
    });
    openEditorProgrammatically();
    await tick();

    const fieldTrigger = document.querySelector<HTMLButtonElement>(".rule-fields")!;
    expect(fieldTrigger).toBeInstanceOf(HTMLButtonElement);
    expect(document.querySelector(".condition-dialog select")).toBeNull();
    fieldTrigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", pointerId: 1, buttons: 1 }));
    await tick();
    expect(fieldTrigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(fieldTrigger.getAttribute("data-state")).toBe("closed");
  });

  it("docks the dialog inside a narrow desktop dock without covering the window", async () => {
    await render("review", "384px");
    openEditorProgrammatically();
    await tick();

    const dialog = document.querySelector<HTMLElement>(".condition-dialog")!;
    expect(dialog.classList.contains("condition-dialog")).toBe(true);
    // The host is far narrower than the window: the dialog stays inside the
    // host rect instead of going full bleed across the app window.
    expect(dialog.style.width).toBe("384px");
    expect(dialog.style.left).toBe("0px");
    expect(dialog.style.top).toBe("0px");
    expect(dialog.style.maxHeight).toBe("768px");
    expect(dialog.style.transform).toBe("none");
    // Narrow hosts switch conditions through the compact Select library.
    expect(document.querySelector('[data-testid="filter-condition-switcher"]')).not.toBeNull();
    expect(document.querySelector(".condition-library-chips")).toBeNull();
    // Narrow hosts drop the summary row: the launcher chips open the editor.
    expect(document.querySelector(".condition-summary-row")).toBeNull();
  });

  it("keeps the full-bleed dock when the host spans a phone viewport", async () => {
    await page.viewport(390, 844);
    await render("review");
    openEditorProgrammatically();
    await tick();

    const dialog = document.querySelector<HTMLElement>(".condition-dialog")!;
    expect(dialog.style.width).toBe("100vw");
    expect(dialog.style.left).toBe("0px");
    expect(dialog.style.maxHeight).toBe("100dvh");
  });
});
