import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import IconPicker from "./icon-picker.svelte";

const labels = { search: "搜索图标…", empty: "没有匹配的图标" };

let component: ReturnType<typeof mount> | undefined;
let sprite: SVGSVGElement | undefined;

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  sprite?.remove();
  sprite = undefined;
  document.body.innerHTML = "";
});

function injectSprite() {
  sprite = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  sprite.setAttribute("style", "position:absolute;width:0;height:0;overflow:hidden");
  sprite.innerHTML = `
    <symbol id="spriteDefinitions" viewBox="0 0 24 24"></symbol>
    <symbol id="iconClose" viewBox="0 0 24 24"></symbol>
    <symbol id="iconFace" viewBox="0 0 24 24"></symbol>
    <symbol id="iconDamophusPanelLeftClose" viewBox="0 0 24 24"></symbol>`;
  document.body.append(sprite);
}

function render(props: Record<string, unknown> = {}) {
  const target = document.createElement("div");
  target.className = "damophus-theme-root damophus-question-bank-theme";
  document.body.append(target);
  component = mount(IconPicker, { target, props: { labels, ...props } });
  return target;
}

function gridButtons(target: HTMLElement) {
  return [...target.querySelectorAll<HTMLButtonElement>('[data-slot="icon-picker-grid"] button')];
}

describe("icon picker", () => {
  it("lists SiYuan icon symbols in order and paints each with a namespaced use", async () => {
    injectSprite();
    const target = render();
    await tick();

    const buttons = gridButtons(target);
    expect(buttons.map((button) => button.title)).toEqual([
      "iconClose",
      "iconDamophusPanelLeftClose",
      "iconFace",
    ]);

    const use = buttons[0]!.querySelector("use")!;
    expect(use.getAttribute("href")).toBe("#iconClose");
    expect(use.getAttribute("xlink:href")).toBe("#iconClose");
  });

  it("filters icons by search text and shows the empty state", async () => {
    injectSprite();
    const target = render();
    await tick();

    const input = target.querySelector<HTMLInputElement>("input[type='search']")!;
    input.value = "damo";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(gridButtons(target).map((button) => button.title)).toEqual(["iconDamophusPanelLeftClose"]);

    input.value = "zzz";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(gridButtons(target)).toHaveLength(0);
    expect(target.textContent).toContain(labels.empty);
  });

  it("highlights the selected icon and reports the pick", async () => {
    injectSprite();
    const onSelect = vi.fn();
    const target = render({ selected: "iconFace", onSelect });
    await tick();

    const selectedButton = gridButtons(target).find((button) => button.getAttribute("aria-pressed") === "true");
    expect(selectedButton?.title).toBe("iconFace");

    gridButtons(target).find((button) => button.title === "iconClose")!.click();
    await tick();
    expect(onSelect).toHaveBeenCalledWith("iconClose");
  });
});
