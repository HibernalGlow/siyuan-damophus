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
  it("renders a bookmarked but not wrong condition in the SVAR builder", async () => {
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
    const rules = [...document.querySelectorAll<HTMLElement>(".wx-rule")].map((item) => item.innerText);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toContain("Bookmark status");
    expect(rules[0]).toContain("Bookmarked");
    expect(rules[1]).toContain("Wrong-answer status");
    expect(rules[1]).toContain("Not wrong");
    expect(document.querySelector(".wx-glue")?.textContent).toContain("and");
  });

  it("migrates a legacy filter and clears it from the editor", async () => {
    await render("review");
    document.querySelector<HTMLButtonElement>(".condition-summary-trigger")!.click();
    await tick();
    expect(document.querySelector(".wx-rule")?.textContent).toContain("Needs review");

    document.querySelector<HTMLButtonElement>('button[aria-label="Clear conditions"]')!.click();
    await tick();

    expect(document.querySelectorAll(".wx-rule")).toHaveLength(0);
  });

  it("opens the rule editor when adding the first condition", async () => {
    await render("all");

    document.querySelector<HTMLButtonElement>(".condition-summary-trigger")!.click();
    await tick();
    const addButton = [...document.querySelectorAll<HTMLButtonElement>(".wx-filter-builder button")].find((button) =>
      button.textContent?.includes("Add condition"),
    );
    expect(addButton).toBeDefined();

    addButton!.click();
    await tick();

    expect(document.querySelector(".wx-panel")).not.toBeNull();
    expect(document.querySelector(".wx-panel")?.textContent).toContain("Attempt status");

    await new Promise((resolve) => setTimeout(resolve, 10));
    const applyButton = [...document.querySelectorAll<HTMLButtonElement>(".condition-dialog-footer button")].find((button) =>
      button.textContent?.includes("Apply"),
    );
    applyButton?.click();
    await tick();
    expect(document.querySelector(".condition-summary-copy")?.textContent).toContain("Attempted");
  });

  it("reopens a saved condition for editing", async () => {
    await render({
      glue: "and",
      rules: [{ field: "bookmarked", type: "tuple", filter: "equal", value: "yes" }],
    });

    document.querySelector<HTMLButtonElement>(".condition-summary-trigger")!.click();
    await tick();
    document.querySelector<HTMLElement>(".wx-rule")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await tick();

    expect(document.querySelector(".wx-panel")).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 10));
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Cancel"))
      ?.click();
    await tick();
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
});
