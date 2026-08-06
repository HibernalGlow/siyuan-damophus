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
      <div class="toolbar toolbar--border">
        <input id="toolbarName" class="toolbar__title">
        <span id="toolbarNameReadonly" class="toolbar__title"></span>
        <button id="toolbarTabs"></button>
        <svg id="toolbarMore"></svg>
      </div>
      <div id="editor">
        <div class="protyle-breadcrumb">
          <button data-type="mobile-menu"></button>
          <button class="block__icon" data-type="readonly"></button>
          <button class="block__icon" data-type="doc"></button>
          <button class="block__icon" data-type="more"></button>
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
    expect(getComputedStyle(lock).top).toBe("-40px");
    expect(getComputedStyle(lock).right).toBe("158px");
    expect(getComputedStyle(doc).position).toBe("fixed");
    expect(getComputedStyle(doc).right).toBe("118px");
    expect(getComputedStyle(more).position).toBe("fixed");
    expect(getComputedStyle(more).right).toBe("78px");
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

});
