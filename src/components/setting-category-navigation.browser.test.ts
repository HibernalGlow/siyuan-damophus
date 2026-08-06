import { mount, tick, unmount } from "svelte";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingCategoryNavigation from "./setting-category-navigation.svelte";

let mounted: ReturnType<typeof mount>[] = [];

afterEach(async () => {
  await Promise.all(mounted.map((component) => unmount(component)));
  mounted = [];
  document.body.innerHTML = "";
});

function render(select = vi.fn()) {
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
      closeLabel: "关闭",
    },
    events: { select },
  }));
  return { target, select };
}

describe("setting category navigation", () => {
  it("keeps the sidebar on desktop", async () => {
    await page.viewport(900, 700);
    const { target } = render();
    await tick();

    expect(getComputedStyle(target.querySelector("nav")!).display).not.toBe("none");
    expect(getComputedStyle(target.querySelector('button[aria-label="设置分类"]')!).display).toBe("none");
  });

  it("uses a bottom drawer on mobile and closes after choosing a category", async () => {
    await page.viewport(390, 700);
    const { target, select } = render();
    await tick();

    expect(getComputedStyle(target.querySelector("nav")!).display).toBe("none");
    const trigger = target.querySelector<HTMLButtonElement>('button[aria-label="设置分类"]');
    if (!trigger) throw new Error("Missing mobile category trigger");

    trigger.click();
    await tick();
    expect(document.body.textContent).toContain("选择要显示的设置分类");
    expect(document.body.textContent).toContain("通用设置");
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);

    const category = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "通用设置",
    );
    if (!category) throw new Error("Missing drawer category");
    category.click();
    await tick();

    expect(select).toHaveBeenCalledWith(expect.objectContaining({ detail: "设置" }));
    const dialogContent = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialogContent?.getAttribute("data-state")).toBe("closed");
  });
});
