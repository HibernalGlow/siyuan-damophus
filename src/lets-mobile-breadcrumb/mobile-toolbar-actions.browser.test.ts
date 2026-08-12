import "@/styles/damophus.css";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  document.documentElement.removeAttribute("data-frontend");
  document.body.replaceChildren();
});

describe("mobile breadcrumb toolbar actions", () => {
  it("visually relocates lock and more without cloning the native buttons", () => {
    document.documentElement.dataset.frontend = "browser-mobile";
    document.body.innerHTML = `
      <div class="toolbar toolbar--border" style="height: 42px">
        <input id="toolbarName" class="toolbar__title">
        <span id="toolbarNameReadonly" class="toolbar__title"></span>
        <button id="toolbarTabs"></button>
        <svg id="toolbarMore"></svg>
      </div>
      <div id="editor">
        <div class="protyle-breadcrumb">
          <button data-type="mobile-menu"></button>
          <button class="block__icon" data-type="readonly"><svg><use href="#iconLock"></use></svg></button>
          <button class="block__icon" data-type="doc"><svg><use href="#iconFile"></use></svg></button>
          <button class="block__icon" data-type="more"><svg><use href="#iconMore"></use></svg></button>
        </div>
      </div>
    `;

    const lock = document.querySelector<HTMLElement>('[data-type="readonly"]')!;
    const more = document.querySelector<HTMLElement>('[data-type="more"]')!;
    const doc = document.querySelector<HTMLElement>('[data-type="doc"]')!;
    const title = document.getElementById("toolbarName")!;
    const toolbar = document.querySelector<HTMLElement>("body > .toolbar")!;
    const tabs = document.getElementById("toolbarTabs")!;
    const lockClick = vi.fn();
    const moreClick = vi.fn();
    lock.addEventListener("click", lockClick);
    more.addEventListener("click", moreClick);

    expect(getComputedStyle(lock).position).toBe("fixed");
    expect(getComputedStyle(lock).top).toBe("1px");
    expect(getComputedStyle(lock).display).toBe("flex");
    expect(getComputedStyle(lock).height).toBe("40px");
    expect(getComputedStyle(lock).width).toBe("32px");
    expect(getComputedStyle(lock).right).toBe("168px");
    expect(getComputedStyle(doc).position).toBe("fixed");
    expect(getComputedStyle(doc).right).toBe("134px");
    expect(getComputedStyle(more).position).toBe("fixed");
    expect(getComputedStyle(more).right).toBe("100px");
    for (const action of [lock, doc, more]) {
      const icon = action.querySelector<SVGElement>("svg")!;
      expect(action.getBoundingClientRect().top + action.getBoundingClientRect().height / 2).toBe(21);
      expect(getComputedStyle(icon).display).toBe("block");
      expect(getComputedStyle(icon).width).toBe("20px");
      expect(getComputedStyle(icon).height).toBe("20px");
    }
    expect(getComputedStyle(more.querySelector("svg")!).transform).not.toBe("none");
    expect(getComputedStyle(title).marginInlineEnd).toBe("120px");
    expect(getComputedStyle(toolbar).pointerEvents).toBe("none");
    expect(getComputedStyle(title).pointerEvents).toBe("auto");
    expect(getComputedStyle(tabs).pointerEvents).toBe("auto");
    expect(document.querySelectorAll('[data-type="readonly"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-type="more"]')).toHaveLength(1);

    lock.click();
    more.click();
    expect(lockClick).toHaveBeenCalledOnce();
    expect(moreClick).toHaveBeenCalledOnce();
  });

  it("keeps the fullscreen plugin menu opaque without the liquid-glass module", () => {
    document.documentElement.dataset.frontend = "mobile";
    document.documentElement.style.setProperty("--b3-theme-background", "rgb(21, 19, 32)");
    document.body.innerHTML = `
      <div class="b3-menu b3-menu--fullscreen">
        <div class="b3-menu__items"><button>Damophus</button></div>
      </div>
    `;

    const menu = document.querySelector<HTMLElement>(".b3-menu--fullscreen")!;
    const items = menu.querySelector<HTMLElement>(".b3-menu__items")!;
    expect(getComputedStyle(menu).backgroundColor).toBe("rgb(21, 19, 32)");
    expect(getComputedStyle(items).backgroundColor).toBe("rgb(21, 19, 32)");
    expect(getComputedStyle(menu).backdropFilter).toBe("none");
  });

});
