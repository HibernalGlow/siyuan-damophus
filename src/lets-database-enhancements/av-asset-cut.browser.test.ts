import { describe, expect, it } from "vitest";
import { appendAssetCutMenu } from "./av-asset-cut";

describe("database asset cut menu", () => {
  it("copies through the native action before deleting the asset", () => {
    document.body.innerHTML = `
      <div id="commonMenu">
        <div class="b3-menu__items">
          <button data-id="copy" type="button">Copy</button>
          <button data-id="delete" type="button">Delete</button>
        </div>
      </div>`;
    const menu = document.querySelector<HTMLElement>("#commonMenu")!;
    const order: string[] = [];
    menu.querySelector<HTMLElement>('[data-id="copy"]')!.addEventListener("click", () => order.push("copy"));
    menu.querySelector<HTMLElement>('[data-id="delete"]')!.addEventListener("click", () => order.push("delete"));

    expect(appendAssetCutMenu(menu, "Cut")).toBe(true);
    menu.querySelector<HTMLElement>('[data-damophus-asset-cut]')!.click();

    expect(order).toEqual(["copy", "delete"]);
    expect(menu.querySelector("[data-damophus-asset-cut] .b3-menu__label")?.textContent).toBe("Cut");
  });

  it("does not add duplicate actions", () => {
    document.body.innerHTML = `
      <div id="commonMenu"><div class="b3-menu__items">
        <button data-id="copy" type="button"></button>
        <button data-id="delete" type="button"></button>
      </div></div>`;
    const menu = document.querySelector<HTMLElement>("#commonMenu")!;
    expect(appendAssetCutMenu(menu, "Cut")).toBe(true);
    expect(appendAssetCutMenu(menu, "Cut")).toBe(false);
    expect(menu.querySelectorAll("[data-damophus-asset-cut]")).toHaveLength(1);
  });
});
