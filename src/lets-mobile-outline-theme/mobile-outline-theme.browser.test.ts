import { afterEach, describe, expect, it } from "vitest";
import { MobileOutlineThemeCompatibility } from "./mobile-outline-theme";

function mountMobileOutline(existingClasses = "fn__flex-column"): HTMLElement {
  document.documentElement.dataset.frontend = "mobile";
  const sidebar = document.createElement("aside");
  sidebar.id = "sidebar";
  sidebar.innerHTML = `
    <div data-type="sidebar-outline" class="${existingClasses}">
      <div class="fn__flex-1">
        <ul class="b3-list b3-list--background">
          <li class="b3-list-item" data-type="NodeHeading" data-subtype="h1">Heading</li>
        </ul>
      </div>
    </div>
  `;
  document.body.append(sidebar);
  return sidebar.querySelector<HTMLElement>('[data-type="sidebar-outline"]')!;
}

afterEach(() => {
  document.body.replaceChildren();
  document.head.querySelectorAll("[data-test-mobile-outline-theme]").forEach((element) => element.remove());
  delete document.documentElement.dataset.frontend;
});

describe("mobile outline theme compatibility", () => {
  it("activates desktop theme selectors for the native mobile outline", () => {
    const style = document.createElement("style");
    style.dataset.testMobileOutlineTheme = "true";
    style.textContent = `
      .file-tree.sy__outline .b3-list-item[data-subtype="h1"] {
        color: rgb(210, 45, 80);
      }
    `;
    document.head.append(style);
    const outline = mountMobileOutline();
    const heading = outline.querySelector<HTMLElement>(".b3-list-item")!;
    const compatibility = new MobileOutlineThemeCompatibility();

    expect(getComputedStyle(heading).color).not.toBe("rgb(210, 45, 80)");
    compatibility.start();

    expect(outline.classList.contains("file-tree")).toBe(true);
    expect(outline.classList.contains("sy__outline")).toBe(true);
    expect(getComputedStyle(heading).color).toBe("rgb(210, 45, 80)");

    compatibility.destroy();
    expect(outline.classList.contains("file-tree")).toBe(false);
    expect(outline.classList.contains("sy__outline")).toBe(false);
  });

  it("preserves compatibility classes that were already owned by the host", () => {
    const outline = mountMobileOutline("fn__flex-column file-tree sy__outline");
    const compatibility = new MobileOutlineThemeCompatibility();

    compatibility.start();
    compatibility.destroy();

    expect(outline.classList.contains("file-tree")).toBe(true);
    expect(outline.classList.contains("sy__outline")).toBe(true);
  });

  it("waits for a mobile outline mounted after plugin startup", async () => {
    document.documentElement.dataset.frontend = "browser-mobile";
    const compatibility = new MobileOutlineThemeCompatibility();
    compatibility.start();

    const outline = mountMobileOutline();
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(outline.classList.contains("file-tree")).toBe(true);
    expect(outline.classList.contains("sy__outline")).toBe(true);
    compatibility.destroy();
  });
});
