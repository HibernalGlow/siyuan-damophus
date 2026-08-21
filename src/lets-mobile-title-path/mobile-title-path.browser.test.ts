import { afterEach, describe, expect, it } from "vitest";
import { MOBILE_TITLE_PATH_STYLE_ID, MobileTitlePath, readableParentPath } from "./mobile-title-path";

function mountToolbar(): HTMLInputElement {
  document.documentElement.dataset.frontend = "mobile";
  const toolbar = document.createElement("div");
  toolbar.className = "toolbar toolbar--border";
  toolbar.style.cssText = "display:flex;align-items:center;width:390px;height:48px";
  toolbar.innerHTML = `
    <svg style="width:40px;height:40px;flex:none"></svg>
    <input class="toolbar__title" id="toolbarName" value="Contract" />
    <svg style="width:40px;height:40px;flex:none"></svg>
  `;
  document.body.append(toolbar);
  return toolbar.querySelector<HTMLInputElement>("#toolbarName")!;
}

afterEach(() => {
  document.body.replaceChildren();
  delete document.documentElement.dataset.frontend;
  document.getElementById(MOBILE_TITLE_PATH_STYLE_ID)?.remove();
});

describe("mobile title path", () => {
  it("derives the containing document path from a human-readable path", () => {
    expect(readableParentPath("/Civil/Obligations/Contract")).toBe("/Civil/Obligations");
    expect(readableParentPath("/Contract")).toBe("/");
  });

  it("shows the path below the editable native title without overflowing the toolbar", async () => {
    const input = mountToolbar();
    const feature = new MobileTitlePath(async () => "/Civil/Obligations/Contract");

    await feature.show("document-1");

    const wrapper = document.querySelector<HTMLElement>(".damophus-mobile-title-path")!;
    const location = document.querySelector<HTMLElement>(".damophus-mobile-title-path__location")!;
    expect(wrapper.contains(input)).toBe(true);
    expect(input.value).toBe("Contract");
    expect(location.textContent).toBe("/Civil/Obligations");
    expect(location.title).toBe("/Civil/Obligations/Contract");
    expect(input.getBoundingClientRect().bottom).toBeLessThanOrEqual(location.getBoundingClientRect().top);
    expect(wrapper.scrollWidth).toBeLessThanOrEqual(wrapper.clientWidth);
    expect(wrapper.getBoundingClientRect().height).toBe(48);

    feature.destroy();
    expect(document.querySelector(".damophus-mobile-title-path")).toBeNull();
    expect(document.querySelector(".toolbar")?.contains(input)).toBe(true);
  });

  it("keeps the latest path when document requests finish out of order", async () => {
    mountToolbar();
    const resolvers = new Map<string, (path: string) => void>();
    const feature = new MobileTitlePath((id) => new Promise((resolve) => resolvers.set(id, resolve)));

    const first = feature.show("first");
    const second = feature.show("second");
    resolvers.get("second")?.("/Current/Second");
    await second;
    resolvers.get("first")?.("/Stale/First");
    await first;

    expect(document.querySelector(".damophus-mobile-title-path__location")?.textContent).toBe("/Current");
    feature.destroy();
  });
});
