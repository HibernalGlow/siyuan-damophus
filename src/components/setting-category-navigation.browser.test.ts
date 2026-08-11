import { mount, tick, unmount } from "svelte";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingCategoryNavigation from "./setting-category-navigation.svelte";

let mounted: ReturnType<typeof mount>[] = [];
type EventHandler = (event: any) => void;

afterEach(async () => {
  await Promise.all(mounted.map((component) => unmount(component)));
  mounted = [];
  document.body.innerHTML = "";
});

function render({
  select = vi.fn() as EventHandler,
  back = vi.fn() as EventHandler,
  mobile = false,
  showCategories = false,
}: {
  select?: EventHandler;
  back?: EventHandler;
  mobile?: boolean;
  showCategories?: boolean;
} = {}) {
  const target = document.createElement("div");
  target.className = "damophus-theme-root damophus-question-bank-theme";
  document.body.appendChild(target);
  mounted.push(mount(SettingCategoryNavigation, {
    target,
    props: {
      groups: ["开关", "设置", "题库"],
      focusGroup: "开关",
      getGroupLabel: (group: string) => ({ 开关: "开关", 设置: "通用设置", 题库: "题库" })[group] ?? group,
      categoryLabel: "设置分类",
      categoryDescription: "选择要显示的设置分类",
      preferencesLabel: "偏好设置",
      mobile,
      showCategories,
      backLabel: "返回",
    },
    events: { select, back },
  }));
  return { target, select, back };
}

describe("setting category navigation", () => {
  it("keeps the sidebar on desktop", async () => {
    const hostStyle = document.createElement("style");
    hostStyle.textContent = "svg { fill: currentColor; }";
    document.head.append(hostStyle);
    await page.viewport(900, 700);
    const { target } = render();
    await tick();

    expect(target.querySelector('[data-testid="setting-desktop-navigation"]')).not.toBeNull();
    expect(target.querySelector('[data-testid="setting-mobile-navigation"]')).toBeNull();
    expect(target.querySelector('button[aria-label="设置分类"]')).toBeNull();
    const icon = target.querySelector<SVGElement>("svg.lucide");
    expect(icon).not.toBeNull();
    expect(getComputedStyle(icon!).fill).toBe("none");
    expect(getComputedStyle(icon!).strokeWidth).toBe("1.75px");
    hostStyle.remove();
  });

  it("shows a single-page category list in compact layouts", async () => {
    await page.viewport(390, 700);
    const select = vi.fn();
    const { target } = render({ select, mobile: true, showCategories: true });
    await tick();

    expect(target.querySelector('[data-testid="setting-desktop-navigation"]')).toBeNull();
    expect(target.querySelector('[data-testid="setting-mobile-navigation"]')).not.toBeNull();
    expect(document.body.textContent).toContain("选择要显示的设置分类");
    expect(document.body.textContent).toContain("通用设置");
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);

    const category = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "通用设置",
    );
    if (!category) throw new Error("Missing compact category");
    category.click();
    await tick();

    expect(select).toHaveBeenCalledWith(expect.objectContaining({ detail: "设置" }));
  });

  it("uses a page-level back action in compact detail views", async () => {
    await page.viewport(390, 700);
    const back = vi.fn();
    const { target } = render({ back, mobile: true, showCategories: false });
    await tick();

    expect(target.querySelector('[data-testid="setting-mobile-navigation"]')).toBeNull();
    expect(target.querySelector('[data-testid="setting-mobile-detail-navigation"]')).not.toBeNull();
    const backButton = target.querySelector<HTMLButtonElement>('button[aria-label="返回"]');
    if (!backButton) throw new Error("Missing compact back button");
    backButton.click();
    await tick();

    expect(back).toHaveBeenCalledOnce();
  });

  it("filters groups by search and supports expand/collapse all", async () => {
    await page.viewport(900, 700);
    const select = vi.fn();
    const expandedChanged = vi.fn();
    const target = document.createElement("div");
    target.className = "damophus-theme-root damophus-question-bank-theme";
    document.body.appendChild(target);
    mounted.push(mount(SettingCategoryNavigation, {
      target,
      props: {
        groups: ["开关", "设置", "题库", "表格"],
        focusGroup: "开关",
        getGroupLabel: (group: string) => ({
          开关: "开关", 设置: "通用设置", 题库: "题库", 表格: "表格自适应",
        })[group] ?? group,
        categorySections: [
          { id: "core", label: "快速入口", description: "", icon: "layoutGrid", groups: ["开关", "设置"] },
          { id: "study", label: "学习与知识", description: "", icon: "graduationCap", groups: ["题库", "表格"] },
        ],
        searchPlaceholder: "搜索模块",
        expandAllLabel: "全部展开",
        collapseAllLabel: "全部收起",
        noMatchesLabel: "没有匹配的模块。",
      },
      events: { select, expandedChanged },
    }));
    await tick();

    // Every category starts expanded by default.
    expect(target.textContent).toContain("题库");
    // Category headers carry their own icons.
    const studyHeader = [...target.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.includes("学习与知识"),
    );
    expect(studyHeader?.querySelector("svg.lucide-graduation-cap")).not.toBeNull();

    const collapseAll = target.querySelector<HTMLButtonElement>('button[aria-label="全部收起"]');
    if (!collapseAll) throw new Error("Missing collapse-all action");
    collapseAll.click();
    await tick();
    expect(target.textContent).not.toContain("题库");
    expect(expandedChanged).toHaveBeenCalledWith(expect.objectContaining({
      detail: { core: false, study: false },
    }));

    const expandAll = target.querySelector<HTMLButtonElement>('button[aria-label="全部展开"]');
    if (!expandAll) throw new Error("Missing expand-all action");
    expandAll.click();
    await tick();
    expect(target.textContent).toContain("题库");

    const search = target.querySelector<HTMLInputElement>('input[type="search"]');
    if (!search) throw new Error("Missing search input");
    search.value = "题库";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(target.textContent).toContain("题库");
    expect(target.textContent).not.toContain("表格自适应");
    expect(target.textContent).not.toContain("快速入口");

    const studyGroup = [...target.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.includes("题库"),
    );
    if (!studyGroup) throw new Error("Missing filtered group");
    studyGroup.click();
    await tick();
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ detail: "题库" }));

    search.value = "不存在";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(target.textContent).toContain("没有匹配的模块。");
  });
});
