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
  it("uses a distinct icon for every registered settings feature", async () => {
    await page.viewport(900, 700);
    const target = document.createElement("div");
    target.className = "damophus-theme-root damophus-question-bank-theme";
    document.body.appendChild(target);
    mounted.push(mount(SettingCategoryNavigation, {
      target,
      props: {
        groups: [
          "寮€鍏?",
          "璁剧疆",
          "lets-animated-image-replay.displayName",
          "lets-block-attr.displayName",
          "lets-kramdown-export.displayName",
          "lets-layout-actions.displayName",
          "lets-list-merge.displayName",
          "lets-mobile-breadcrumb.displayName",
          "lets-mobile-liquid-glass.displayName",
          "lets-question-bank.displayName",
          "lets-skill-manager.displayName",
          "lets-topic-relations.displayName",
          "lets-agent-bridge.displayName",
        ],
        focusGroup: "寮€鍏?",
        getGroupLabel: (group: string) => group,
      },
    }));
    await tick();

    const navigation = target.querySelector<HTMLElement>('[data-testid="setting-desktop-navigation"]');
    if (!navigation) throw new Error("Missing desktop navigation");
    const iconNames = [...navigation.querySelectorAll<SVGElement>("svg")]
      .map((icon) => [...icon.classList].find(
        (name) => name.startsWith("lucide-") && name !== "lucide-icon",
      ));
    expect(iconNames).toHaveLength(13);
    expect(new Set(iconNames).size).toBe(iconNames.length);
  });

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
});
