import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import Switch from "./switch.svelte";

let mounted: ReturnType<typeof mount>[] = [];

afterEach(async () => {
  await Promise.all(mounted.map((component) => unmount(component)));
  mounted = [];
  document.body.innerHTML = "";
});

function edgeGaps(root: HTMLElement, thumb: HTMLElement) {
  const rootRect = root.getBoundingClientRect();
  const thumbRect = thumb.getBoundingClientRect();
  const style = getComputedStyle(root);
  const leftBorder = Number.parseFloat(style.borderLeftWidth);
  const rightBorder = Number.parseFloat(style.borderRightWidth);

  return {
    left: thumbRect.left - rootRect.left - leftBorder,
    right: rootRect.right - rightBorder - thumbRect.right,
  };
}

function renderSwitch(checked: boolean) {
  const target = document.createElement("div");
  target.className = "damophus-theme-root";
  document.body.appendChild(target);
  mounted.push(mount(Switch, {
    target,
    props: { size: "sm", checked, "aria-label": "题库块标识" },
  }));
  return target;
}

describe("switch", () => {
  it("moves the small thumb fully between the left and right edges", async () => {
    await page.viewport(390, 700);
    const target = renderSwitch(false);
    await tick();

    const root = target.querySelector<HTMLElement>('[data-slot="switch"]');
    const thumb = target.querySelector<HTMLElement>('[data-slot="switch-thumb"]');
    if (!root || !thumb) throw new Error("Missing switch geometry fixtures");

    expect(getComputedStyle(root).paddingLeft).toBe("0px");
    expect(edgeGaps(root, thumb).left).toBeLessThan(0.75);

    const checkedTarget = renderSwitch(true);
    await tick();

    const checkedRoot = checkedTarget.querySelector<HTMLElement>('[data-slot="switch"]');
    const checkedThumb = checkedTarget.querySelector<HTMLElement>('[data-slot="switch-thumb"]');
    if (!checkedRoot || !checkedThumb) throw new Error("Missing checked switch geometry fixtures");
    expect(checkedRoot.dataset.state).toBe("checked");
    expect(edgeGaps(checkedRoot, checkedThumb).right).toBeLessThan(0.75);
  });
});
