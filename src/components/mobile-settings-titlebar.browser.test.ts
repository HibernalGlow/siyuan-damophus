import { mount, tick, unmount } from "svelte";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import MobileSettingsTitlebar from "./mobile-settings-titlebar.svelte";

let mounted: ReturnType<typeof mount>[] = [];

afterEach(async () => {
  await Promise.all(mounted.map((component) => unmount(component)));
  mounted = [];
  document.body.innerHTML = "";
});

describe("mobile settings titlebar", () => {
  it("combines the back action and current title in one non-overflowing row", async () => {
    await page.viewport(390, 700);
    const back = vi.fn();
    const target = document.createElement("div");
    target.className = "damophus-theme-root damophus-question-bank-theme";
    document.body.appendChild(target);
    mounted.push(mount(MobileSettingsTitlebar, {
      target,
      props: { title: "Question Bank settings", backLabel: "Back to overview" },
      events: { back },
    }));
    await tick();

    const titlebar = target.querySelector<HTMLElement>('[data-testid="setting-mobile-titlebar"]');
    const button = target.querySelector<HTMLButtonElement>('button[aria-label="Back to overview"]');
    const heading = target.querySelector<HTMLElement>('[role="heading"]');
    if (!titlebar || !button || !heading) throw new Error("Missing mobile settings titlebar fixtures");

    const titlebarRect = titlebar.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    expect(getComputedStyle(titlebar).display).toBe("flex");
    expect(Math.abs((buttonRect.top + buttonRect.height / 2) - (headingRect.top + headingRect.height / 2))).toBeLessThan(2);
    expect(titlebarRect.height).toBeLessThanOrEqual(57);
    expect(titlebar.scrollWidth).toBeLessThanOrEqual(titlebar.clientWidth);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);

    button.click();
    await tick();
    expect(back).toHaveBeenCalledOnce();
  });
});
