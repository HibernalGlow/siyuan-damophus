import { mount, tick, unmount } from "svelte";
import { SOURCES, TRIGGERS } from "svelte-dnd-action";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingOverview, { type OverviewCategory } from "./setting-overview.svelte";

let mounted: ReturnType<typeof mount>[] = [];

afterEach(async () => {
  await Promise.all(mounted.map((component) => unmount(component)));
  mounted = [];
  document.body.innerHTML = "";
});

function render(options: { mode?: "overview" | "navigation"; activeSelectId?: string; compact?: boolean } = {}) {
  const target = document.createElement("div");
  target.className = "damophus-theme-root damophus-question-bank-theme";
  const hostileHostStyle = document.createElement("style");
  hostileHostStyle.textContent = ".damophus-theme-root header { display: block !important; }";
  target.appendChild(hostileHostStyle);
  document.body.appendChild(target);
  const select = vi.fn();
  const toggle = vi.fn();
  const overview = vi.fn();
  const reorder = vi.fn();
  const categories: OverviewCategory[] = [
    {
      id: "core",
      label: "快速入口",
      description: "模块开关、入口管理与通用设置。",
      icon: "layoutGrid",
      modules: [
        { id: "开关", selectId: "开关", label: "开关", icon: "power", enabled: undefined },
        { id: "设置", selectId: "设置", label: "设置", icon: "settings", enabled: undefined },
      ],
    },
    {
      id: "study",
      label: "学习与知识",
      description: "题库练习、考点、属性。",
      icon: "graduationCap",
      enabled: 1,
      total: 2,
      modules: [
        { id: "questionBank", selectId: "题库", label: "题库", icon: "bookOpenCheck", enabled: true },
        { id: "quickAttr", selectId: "属性", label: "块属性", icon: "tags", enabled: false },
      ],
    },
  ];
  mounted.push(mount(SettingOverview, {
    target,
    props: {
      reorderHint: "拖动调整顺序",
      categories,
      ...options,
    },
    events: { select, toggle, overview, reorder },
  }));
  return { target, select, toggle, overview, reorder, categories };
}

function expectCategoryHeaderOnOneRow(card: HTMLElement) {
  const header = card.querySelector<HTMLElement>('[data-testid="overview-category-header"]');
  const handle = header?.querySelector<HTMLElement>('[aria-label^="拖动调整顺序"]');
  const icon = header?.querySelector<SVGElement>("svg");
  const copy = header?.querySelector<HTMLElement>('[data-testid="overview-category-copy"]');
  if (!header || !handle || !icon || !copy) throw new Error("Missing category header fixtures");

  const verticalCenters = [handle, icon, copy].map((element) => {
    const rect = element.getBoundingClientRect();
    return rect.top + rect.height / 2;
  });
  expect(getComputedStyle(header).display).toBe("grid");
  expect(Math.max(...verticalCenters) - Math.min(...verticalCenters)).toBeLessThan(2);
}

function expectCompactDragHandles(target: HTMLElement) {
  const handles = [...target.querySelectorAll<HTMLElement>('[aria-label^="拖动调整顺序"]')];
  expect(handles.length).toBeGreaterThan(0);
  expect(handles.every((handle) => handle.getBoundingClientRect().width <= 16)).toBe(true);
}

describe("setting overview", () => {
  it("renders every category as a card with icons, counts, and modules", async () => {
    await page.viewport(1100, 800);
    const { target } = render();
    await tick();

    expect(target.querySelector('[data-testid="setting-overview"]')).not.toBeNull();
    expect(target.querySelector('[data-testid="overview-category-core"]')).not.toBeNull();
    expect(target.querySelector('[data-testid="overview-category-study"]')).not.toBeNull();
    expect(target.textContent).toContain("快速入口");
    expect(target.textContent).toContain("学习与知识");
    expect(target.textContent).toContain("1/2");
    expect(target.textContent).toContain("题库");
    expect(target.textContent).toContain("块属性");
    // Category and module icons render.
    expect(target.querySelector("svg.lucide-layout-grid")).not.toBeNull();
    expect(target.querySelector("svg.lucide-graduation-cap")).not.toBeNull();
    expect(target.querySelector("svg.lucide-book-open-check")).not.toBeNull();
    expectCategoryHeaderOnOneRow(target.querySelector<HTMLElement>('[data-testid="overview-category-core"]')!);
    expectCategoryHeaderOnOneRow(target.querySelector<HTMLElement>('[data-testid="overview-category-study"]')!);
    expectCompactDragHandles(target);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  });

  it("uses a single non-overflowing board column on mobile", async () => {
    await page.viewport(390, 760);
    const { target } = render();
    target.style.width = "358px";
    await tick();

    const board = target.querySelector<HTMLElement>('[data-testid="setting-overview"]');
    const cards = [...target.querySelectorAll<HTMLElement>('section[data-testid^="overview-category-"]')];
    if (!board || cards.length < 2) throw new Error("Missing mobile board fixtures");

    expect(getComputedStyle(board).gridTemplateColumns.split(" ")).toHaveLength(1);
    expect(cards.every((card) => card.getBoundingClientRect().width <= board.getBoundingClientRect().width)).toBe(true);
    cards.forEach(expectCategoryHeaderOnOneRow);
    expectCompactDragHandles(target);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  });

  it("dispatches select when a module is opened", async () => {
    await page.viewport(1100, 800);
    const { target, select } = render();
    await tick();

    const moduleButton = [...target.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.includes("题库"),
    );
    if (!moduleButton) throw new Error("Missing overview module");
    moduleButton.click();
    await tick();

    expect(select).toHaveBeenCalledWith(expect.objectContaining({ detail: "题库" }));
  });

  it("toggles a module directly without opening its settings", async () => {
    await page.viewport(1100, 800);
    const { target, select, toggle } = render();
    await tick();

    const moduleSwitch = target.querySelector<HTMLButtonElement>('[aria-label="Enable module: 题库"]');
    if (!moduleSwitch) throw new Error("Missing overview module switch");
    moduleSwitch.click();
    await tick();

    expect(toggle).toHaveBeenCalledWith(expect.objectContaining({
      detail: { id: "questionBank", enabled: false },
    }));
    expect(select).not.toHaveBeenCalled();
  });

  it("morphs into the selected category card for detail navigation", async () => {
    await page.viewport(1100, 800);
    const { target, overview } = render({ mode: "navigation", activeSelectId: "题库" });
    target.style.width = "256px";
    await tick();

    expect(target.querySelector('[data-testid="setting-overview-shell"]')?.getAttribute("data-mode")).toBe("navigation");
    expect(target.querySelector('[data-testid="overview-category-core"]')).toBeNull();
    expect(target.querySelector('[data-testid="overview-category-study"]')).not.toBeNull();
    expect(target.querySelectorAll('[data-testid="overview-module-zone-study"] li')).toHaveLength(2);
    expect(target.querySelector('[aria-current="page"]')?.textContent).toContain("题库");
    expect(target.querySelector('[aria-label^="拖动调整顺序"]')).toBeNull();

    const backButton = [...target.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Back to overview"));
    if (!backButton) throw new Error("Missing overview return control");
    backButton.click();
    await tick();
    expect(overview).toHaveBeenCalledOnce();
  });

  it("compresses detail navigation to the active item on mobile", async () => {
    await page.viewport(390, 760);
    const { target } = render({ mode: "navigation", activeSelectId: "题库", compact: true });
    await tick();

    const rows = [...target.querySelectorAll<HTMLElement>('[data-testid="overview-module-zone-study"] li')];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain("题库");
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  });

  it("dispatches reorder when the category board finalizes a move", async () => {
    await page.viewport(1100, 800);
    const { target, reorder, categories } = render();
    await tick();

    const board = target.querySelector<HTMLElement>('[data-testid="setting-overview"]');
    if (!board) throw new Error("Missing category board");

    board.dispatchEvent(new CustomEvent("finalize", {
      detail: {
        items: [categories[1], categories[0]],
        info: { id: "study", source: SOURCES.POINTER, trigger: TRIGGERS.DROPPED_INTO_ZONE },
      },
    }));
    await tick();

    expect(reorder).toHaveBeenCalledWith(expect.objectContaining({
      detail: { categoryOrder: ["study", "core"] },
    }));
  });

  it("dispatches module reorder when a nested list finalizes a move", async () => {
    await page.viewport(1100, 800);
    const { target, reorder, categories } = render();
    await tick();

    const moduleZone = target.querySelector<HTMLElement>('[data-testid="overview-module-zone-study"]');
    if (!moduleZone) throw new Error("Missing module drag zone");

    moduleZone.dispatchEvent(new CustomEvent("finalize", {
      detail: {
        items: [categories[1].modules[1], categories[1].modules[0]],
        info: { id: "quickAttr", source: SOURCES.POINTER, trigger: TRIGGERS.DROPPED_INTO_ZONE },
      },
    }));
    await tick();

    expect(reorder).toHaveBeenCalledWith(expect.objectContaining({
      detail: { moduleOrder: { categoryId: "study", order: ["quickAttr", "questionBank"] } },
    }));
  });
});
