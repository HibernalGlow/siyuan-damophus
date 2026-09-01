import { afterEach, describe, expect, it, vi } from "vitest";
import { isolateFloatingOutlinesFromMobileDock } from "./mobile-dock-outline-isolation";
import "@/styles/damophus.css";

const OUTLINE_ISOLATION_CLASS = "damophus-question-bank-dock-open";
const outlineSelector = '[data-testid="document-outline"]';

afterEach(() => {
  document.body.classList.remove(OUTLINE_ISOLATION_CLASS);
  document.body.replaceChildren();
});

function mountFixture(sidebarStyle = "", panelClass = ""): HTMLElement {
  document.body.innerHTML = `
    <div id="sidebar" style="${sidebarStyle}">
      <div data-type="sidebar-plugin" class="${panelClass}"></div>
    </div>
    <div class="protyle">
      <div class="siyuan-floating-toc-plugin-container" data-testid="document-outline"></div>
    </div>
  `;
  return document.querySelector<HTMLElement>('[data-type="sidebar-plugin"]')!;
}

const outlineDisplay = () =>
  getComputedStyle(document.querySelector<HTMLElement>(outlineSelector)!).display;
const isolating = () => document.body.classList.contains(OUTLINE_ISOLATION_CLASS);

describe("mobile dock floating outline isolation", () => {
  it("hides every floating outline while the sidebar shows the question-bank panel", () => {
    const panel = mountFixture("transform: translateX(0px)");
    const stop = isolateFloatingOutlinesFromMobileDock(panel);

    expect(isolating()).toBe(true);
    expect(outlineDisplay()).toBe("none");

    stop();
    expect(isolating()).toBe(false);
    expect(outlineDisplay()).not.toBe("none");
  });

  it("keeps outlines visible while the sidebar is closed", () => {
    const panel = mountFixture();
    const stop = isolateFloatingOutlinesFromMobileDock(panel);

    expect(isolating()).toBe(false);
    expect(outlineDisplay()).not.toBe("none");
    stop();
  });

  it("keeps outlines visible while another sidebar tab is active", () => {
    const panel = mountFixture("transform: translateX(0px)", "fn__none");
    const stop = isolateFloatingOutlinesFromMobileDock(panel);

    expect(isolating()).toBe(false);
    expect(outlineDisplay()).not.toBe("none");
    stop();
  });

  it("follows sidebar and tab-panel visibility changes", async () => {
    const panel = mountFixture();
    const sidebar = document.getElementById("sidebar")!;
    const stop = isolateFloatingOutlinesFromMobileDock(panel);
    expect(isolating()).toBe(false);

    sidebar.style.transform = "translateX(0px)";
    await vi.waitFor(() => expect(isolating()).toBe(true));
    expect(outlineDisplay()).toBe("none");

    panel.classList.add("fn__none");
    await vi.waitFor(() => expect(isolating()).toBe(false));

    panel.classList.remove("fn__none");
    await vi.waitFor(() => expect(isolating()).toBe(true));

    sidebar.style.transform = "";
    await vi.waitFor(() => expect(isolating()).toBe(false));
    expect(outlineDisplay()).not.toBe("none");

    stop();
  });
});
