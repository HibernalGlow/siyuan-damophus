import { mount, tick, unmount } from "svelte";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import SwitchSettings from "./switch-settings.svelte";

let mounted: ReturnType<typeof mount>[] = [];

afterEach(async () => {
  await Promise.all(mounted.map((component) => unmount(component)));
  mounted = [];
  document.body.innerHTML = "";
});

function render({ expandedState = {} }: { expandedState?: Record<string, boolean> } = {}) {
  const target = document.createElement("div");
  target.className = "damophus-theme-root damophus-question-bank-theme";
  document.body.appendChild(target);
  const changed = vi.fn();
  const bulkChanged = vi.fn();
  const expandedChanged = vi.fn();
  mounted.push(mount(SwitchSettings, {
    target,
    props: {
      items: [
        { key: "questionBank", title: "Question bank", description: "Practice", value: true, icon: "bookOpenCheck" },
        { key: "quickAttr", title: "Block attributes", description: "Labels", value: false, icon: "tags" },
        { key: "agentSurface", title: "Agent", description: "Agent window", value: true, icon: "sparkles" },
      ],
      categories: [
        {
          id: "study",
          label: "Study & knowledge",
          description: "Study tools",
          icon: "graduationCap",
          modules: ["questionBank", "quickAttr"],
          groups: ["questionBank", "quickAttr"],
        },
        {
          id: "integrations",
          label: "AI & integrations",
          description: "Connected tools",
          icon: "plug",
          modules: ["agentSurface"],
          groups: ["agentSurface"],
        },
      ],
      translate: (_key: string, fallback: string) => fallback,
      expandedState,
    },
    events: { changed, bulkChanged, expandedChanged },
  }));
  return { target, changed, bulkChanged, expandedChanged };
}

describe("switch settings", () => {
  it("starts expanded, collapses one category, remembers the state, and dispatches individual changes", async () => {
    await page.viewport(800, 700);
    const { target, changed, expandedChanged } = render();
    await tick();

    expect(target.textContent).toContain("2 of 3 modules enabled");
    expect(target.querySelectorAll('[role="switch"]')).toHaveLength(3);

    const study = target.querySelector<HTMLButtonElement>('[data-testid="switch-category-study"] header > button');
    if (!study) throw new Error("Missing study category disclosure");
    study.click();
    await tick();

    expect(study.getAttribute("aria-expanded")).toBe("false");
    expect(target.querySelectorAll('[role="switch"]')).toHaveLength(1);
    expect(expandedChanged).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({ study: false }),
    }));

    study.click();
    await tick();
    expect(study.getAttribute("aria-expanded")).toBe("true");
    target.querySelectorAll<HTMLButtonElement>('[role="switch"]')[1]?.click();
    await tick();

    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: { key: "quickAttr", value: true },
    }));
  });

  it("restores persisted expand state", async () => {
    await page.viewport(800, 700);
    const { target } = render({ expandedState: { study: false } });
    await tick();

    const study = target.querySelector<HTMLButtonElement>('[data-testid="switch-category-study"] header > button');
    expect(study?.getAttribute("aria-expanded")).toBe("false");
    expect(target.querySelectorAll('[role="switch"]')).toHaveLength(1);
  });

  it("enables only disabled modules in a category and stays within a narrow viewport", async () => {
    await page.viewport(390, 700);
    const { target, bulkChanged } = render();
    await tick();

    const study = target.querySelector<HTMLButtonElement>('[data-testid="switch-category-study"] header > button');
    expect(study?.getAttribute("aria-expanded")).toBe("true");
    const enableGroup = target.querySelector<HTMLButtonElement>('button[aria-label="Enable group"]');
    if (!enableGroup) throw new Error("Missing category quick action");
    enableGroup.click();
    await tick();

    expect(bulkChanged).toHaveBeenCalledWith(expect.objectContaining({
      detail: { keys: ["quickAttr"], value: true },
    }));
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  });

  it("collapses and expands every category with the quick toggle", async () => {
    await page.viewport(800, 700);
    const { target, expandedChanged } = render();
    await tick();

    expect(target.querySelectorAll('[role="switch"]')).toHaveLength(3);

    const collapseAll = target.querySelector<HTMLButtonElement>('button[aria-label="Collapse all"]');
    if (!collapseAll) throw new Error("Missing collapse-all action");
    collapseAll.click();
    await tick();
    expect(target.querySelectorAll('[role="switch"]')).toHaveLength(0);
    expect(expandedChanged).toHaveBeenCalledWith(expect.objectContaining({
      detail: { study: false, integrations: false },
    }));

    const expandAll = target.querySelector<HTMLButtonElement>('button[aria-label="Expand all"]');
    if (!expandAll) throw new Error("Missing expand-all action");
    expandAll.click();
    await tick();
    expect(target.querySelectorAll('[role="switch"]')).toHaveLength(3);
  });

  it("filters modules by search and auto-expands matching categories", async () => {
    await page.viewport(800, 700);
    const { target } = render({ expandedState: { study: false, integrations: false } });
    await tick();

    expect(target.querySelectorAll('[role="switch"]')).toHaveLength(0);

    const search = target.querySelector<HTMLInputElement>('input[type="search"]');
    if (!search) throw new Error("Missing search input");
    search.value = "agent";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();

    expect(target.querySelectorAll('[role="switch"]')).toHaveLength(1);
    expect(target.textContent).toContain("Agent");
    expect(target.textContent).not.toContain("Block attributes");
    expect(target.textContent).not.toContain("Study & knowledge");

    search.value = "no-such-module";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(target.textContent).toContain("No modules match your search.");

    search.value = "";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(target.textContent).toContain("Study & knowledge");
    // Clearing the search restores the persisted collapsed state.
    expect(target.querySelectorAll('[role="switch"]')).toHaveLength(0);
  });
});
