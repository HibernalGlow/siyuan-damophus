import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollableBreadcrumb } from "./breadcrumb-scroll";

const items = [
  { id: "root", name: "Document root", type: "NodeDocument", subType: "" },
  { id: "section", name: "A long section", type: "NodeHeading", subType: "h2" },
  { id: "current", name: "Current paragraph", type: "NodeParagraph", subType: "" },
];

function breadcrumbElement(): { parent: HTMLDivElement; element: HTMLButtonElement } {
  const parent = document.createElement("div");
  const element = document.createElement("button");
  element.dataset.type = "mobile-menu";
  element.textContent = "Breadcrumb";
  element.style.width = "160px";
  parent.append(element);
  document.body.append(parent);
  return { parent, element };
}

async function settleLayout(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("scrollable mobile breadcrumb", () => {
  it("keeps the complete official path structure and shows the tail by default", async () => {
    const { element } = breadcrumbElement();
    const breadcrumb = new ScrollableBreadcrumb(element, { priority: "tail" });

    breadcrumb.renderMobileItems(items, "current", "Expand");
    await settleLayout();

    expect(element.querySelectorAll(".protyle-breadcrumb__item")).toHaveLength(3);
    expect(element.querySelectorAll(".protyle-breadcrumb__arrow--interactive")).toHaveLength(2);
    expect(element.textContent).toContain("Document root");
    expect(element.textContent).toContain("Current paragraph");
    expect(element.scrollWidth).toBeGreaterThan(element.clientWidth);
    expect(element.scrollLeft).toBe(element.scrollWidth - element.clientWidth);
    breadcrumb.destroy();
  });

  it("navigates from path items while leaving arrows to the official expand handler", () => {
    const navigate = vi.fn();
    const officialHandler = vi.fn();
    const { parent, element } = breadcrumbElement();
    parent.addEventListener("click", officialHandler);
    const breadcrumb = new ScrollableBreadcrumb(element, { priority: "tail", onNavigate: navigate });
    breadcrumb.renderMobileItems(items, "current", "Expand");

    element.querySelector<HTMLElement>('[data-node-id="section"]')!.click();
    expect(navigate).toHaveBeenCalledWith("section");
    expect(officialHandler).not.toHaveBeenCalled();

    element.querySelector<HTMLElement>(".protyle-breadcrumb__arrow--interactive")!.click();
    expect(officialHandler).toHaveBeenCalledOnce();
    breadcrumb.destroy();
  });

  it("can prioritize the head without trapping later manual scrolling", async () => {
    const { element } = breadcrumbElement();
    const breadcrumb = new ScrollableBreadcrumb(element, { priority: "tail" });
    breadcrumb.renderMobileItems(items, "current", "Expand");
    await settleLayout();

    breadcrumb.setPriority("head");
    await settleLayout();
    expect(element.scrollLeft).toBe(0);

    element.scrollLeft = 32;
    await settleLayout();
    expect(element.scrollLeft).toBe(32);
    breadcrumb.destroy();
  });
});
