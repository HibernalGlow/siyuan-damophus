import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findMobileFlashcardBreadcrumbs,
  normalizeBreadcrumbTextDisplay,
  ScrollableBreadcrumb,
} from "./breadcrumb-scroll";

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
    const trailingThemeSpace = document.createElement("span");
    trailingThemeSpace.style.cssText = "display:block;flex:0 0 120px";
    element.append(trailingThemeSpace);
    await settleLayout();

    const tail = element.querySelector<HTMLElement>('[data-node-id="current"]')!;
    expect(element.querySelectorAll(".protyle-breadcrumb__item")).toHaveLength(3);
    expect(element.querySelectorAll(".protyle-breadcrumb__arrow")).toHaveLength(2);
    expect(element.textContent).toContain("Document root");
    expect(element.textContent).toContain("Current paragraph");
    expect(element.scrollWidth).toBeGreaterThan(element.clientWidth);
    expect(element.scrollLeft).toBeCloseTo(
      tail.offsetLeft + tail.offsetWidth - element.clientWidth,
    );
    expect(element.scrollLeft).toBeLessThan(element.scrollWidth - element.clientWidth);
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

    element.querySelector<HTMLElement>(".protyle-breadcrumb__arrow")!.click();
    expect(officialHandler).toHaveBeenCalledOnce();
    breadcrumb.destroy();
  });

  it("vertically centers expand arrows with breadcrumb items", async () => {
    const { element } = breadcrumbElement();
    element.style.height = "32px";
    const breadcrumb = new ScrollableBreadcrumb(element, { priority: "tail" });
    breadcrumb.renderMobileItems(items, "current", "Expand");
    await settleLayout();

    const itemRect = element.querySelector<HTMLElement>(".protyle-breadcrumb__item")!
      .getBoundingClientRect();
    const arrowRect = element.querySelector<HTMLElement>(".protyle-breadcrumb__arrow")!
      .getBoundingClientRect();
    const itemCenter = itemRect.top + itemRect.height / 2;
    const arrowCenter = arrowRect.top + arrowRect.height / 2;

    expect(Math.abs(itemCenter - arrowCenter)).toBeLessThanOrEqual(1);
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

  it("supports complete, character-limited, and width-limited path text", () => {
    const { element } = breadcrumbElement();
    const breadcrumb = new ScrollableBreadcrumb(element, { priority: "tail" });

    breadcrumb.renderMobileItems(
      items,
      "current",
      "Expand",
      normalizeBreadcrumbTextDisplay("characters", 8, 160),
    );
    let text = element.querySelector<HTMLElement>('[data-node-id="current"] .protyle-breadcrumb__text')!;
    expect(text.textContent).toBe("Current ...");
    expect(text.title).toBe("Current paragraph");

    breadcrumb.renderMobileItems(
      items,
      "current",
      "Expand",
      normalizeBreadcrumbTextDisplay("width", 16, 96),
    );
    text = element.querySelector<HTMLElement>('[data-node-id="current"] .protyle-breadcrumb__text')!;
    expect(text.textContent).toBe("Current paragraph");
    expect(text.style.maxWidth).toBe("96px");
    expect(text.classList.contains("damophus-mobile-breadcrumb__text--width")).toBe(true);

    breadcrumb.destroy();
  });

  it("keeps text limits within mobile-safe bounds", () => {
    expect(normalizeBreadcrumbTextDisplay("characters", 1, 999)).toEqual({
      mode: "characters",
      maxCharacters: 4,
      maxWidth: 480,
    });
    expect(normalizeBreadcrumbTextDisplay("width", 500, 20)).toEqual({
      mode: "width",
      maxCharacters: 100,
      maxWidth: 64,
    });
    expect(normalizeBreadcrumbTextDisplay("unknown", "invalid", null)).toEqual({
      mode: "full",
      maxCharacters: 16,
      maxWidth: 64,
    });
  });

  it("discovers the current block in a native mobile flashcard editor", () => {
    const card = document.createElement("div");
    card.className = "card__block";
    card.innerHTML = `
      <div class="protyle">
        <div class="protyle-breadcrumb">
          <button class="protyle-breadcrumb__icon" data-type="mobile-menu">Breadcrumb</button>
        </div>
        <div class="protyle-wysiwyg"><div data-node-id="flashcard-block"></div></div>
      </div>
    `;
    document.body.append(card);

    expect(findMobileFlashcardBreadcrumbs(document)).toEqual([{
      element: card.querySelector(".protyle-breadcrumb__icon"),
      blockId: "flashcard-block",
    }]);
  });
});
