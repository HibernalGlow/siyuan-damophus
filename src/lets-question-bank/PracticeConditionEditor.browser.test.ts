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
    expect(document.querySelector(".wx-rule")?.textContent).toContain("Needs review");

    document.querySelector<HTMLButtonElement>('button[aria-label="Clear conditions"]')!.click();
    await tick();

    expect(document.querySelectorAll(".wx-rule")).toHaveLength(0);
  });
});
