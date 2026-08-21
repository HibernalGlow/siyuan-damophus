import { afterEach, describe, expect, it } from "vitest";
import { MobileOutlineThemeCompatibility } from "./mobile-outline-theme";
import { MobileTitlePath, readableParentPath } from "./mobile-title-path";

afterEach(() => {
  document.body.replaceChildren();
  document.head.querySelectorAll("[data-test-mobile-appearance]").forEach((element) => element.remove());
  delete document.documentElement.dataset.frontend;
  document.getElementById("damophus-mobile-title-path-style")?.remove();
});

describe("mobile appearance enhancements", () => {
  it("renders the readable parent path below the native mobile title", async () => {
    document.documentElement.dataset.frontend = "mobile";
    const toolbar = document.createElement("div");
    toolbar.innerHTML = '<input id="toolbarName" value="Contract">';
    document.body.append(toolbar);
    const tabs = document.createElement("div");
    tabs.innerHTML = '<div class="mobile-tabs__item mobile-tabs__item--active"><span class="mobile-tabs__item-title">Contract</span></div>';
    document.body.append(tabs);
    const titlePath = new MobileTitlePath(async () => "/Civil/Obligations/Contract");

    await titlePath.show({ block: { rootID: "doc-1" } } as never);

    expect(readableParentPath("/Civil/Obligations/Contract")).toBe("/Civil/Obligations");
    expect(document.querySelector(".damophus-mobile-title-path__location")?.textContent).toBe("/Civil/Obligations");
    expect(document.querySelector(".damophus-mobile-tab-path")?.textContent).toBe("/Civil/Obligations");
    titlePath.destroy();
  });

  it("lets theme selectors target the mobile outline and preserves host classes", () => {
    document.documentElement.dataset.frontend = "browser-mobile";
    const sidebar = document.createElement("aside");
    sidebar.id = "sidebar";
    sidebar.innerHTML = '<div data-type="sidebar-outline"><div class="b3-list-item" data-subtype="h1">Heading</div></div>';
    document.body.append(sidebar);
    const outline = sidebar.querySelector<HTMLElement>('[data-type="sidebar-outline"]')!;
    const compatibility = new MobileOutlineThemeCompatibility();

    compatibility.start();
    expect(outline.classList.contains("file-tree")).toBe(true);
    expect(outline.classList.contains("sy__outline")).toBe(true);
    compatibility.destroy();
    expect(outline.classList.contains("file-tree")).toBe(false);
    expect(outline.classList.contains("sy__outline")).toBe(false);
  });

  it("updates tab cards even when the mobile tab-list view has no toolbar title", async () => {
    document.documentElement.dataset.frontend = "mobile";
    const tabs = document.createElement("div");
    tabs.innerHTML = '<div class="mobile-tabs__item"><span class="mobile-tabs__item-title">公务员法</span></div>';
    document.body.append(tabs);
    const titlePath = new MobileTitlePath(async () => "/行政法/公务员法");

    await titlePath.show({ block: { rootID: "doc-2" } } as never);

    expect(document.querySelector(".damophus-mobile-tab-path")?.textContent).toBe("/行政法");
    titlePath.destroy();
  });
});
