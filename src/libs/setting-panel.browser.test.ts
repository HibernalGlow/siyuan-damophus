import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import SettingPanel from "./setting-panel.svelte";

let mounted: ReturnType<typeof mount>[] = [];

afterEach(async () => {
  await Promise.all(mounted.map((component) => unmount(component)));
  mounted = [];
  document.body.innerHTML = "";
});

describe("module switch settings", () => {
  it("shows the module icon beside the total switch and keeps the switch interactive", async () => {
    await page.viewport(390, 700);
    const changed = vi.fn();
    const target = document.createElement("div");
    target.className = "damophus-theme-root damophus-question-bank-theme";
    document.body.appendChild(target);
    mounted.push(mount(SettingPanel, {
      target,
      props: {
        group: "开关",
        mobile: true,
        settingItems: [{
          type: "checkbox",
          title: "技能管理",
          description: "管理思源 AI 使用的技能",
          key: "skillManager",
          value: false,
          icon: "brain",
        }],
      },
      events: { changed },
    }));
    await tick();

    expect(target.querySelector("svg.lucide-brain")).not.toBeNull();
    const toggle = target.querySelector<HTMLButtonElement>('[role="switch"]');
    if (!toggle) throw new Error("Missing module switch");
    toggle.click();
    await tick();

    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: { group: "开关", key: "skillManager", value: true },
    }));
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  });
});
