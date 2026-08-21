import { afterEach, describe, expect, it } from "vitest";
import { applyCoverLayout } from "./more-background";

function renderHeader(): HTMLElement {
  document.body.innerHTML = `
    <div class="protyle">
      <div class="protyle-breadcrumb">
        <div class="protyle-breadcrumb__bar">Document</div>
        <span class="protyle-breadcrumb__space"></span>
        <button data-type="doc">Doc</button><button data-type="more">More</button>
      </div>
      <div class="protyle-background">
        <div class="protyle-background__img"><img><div class="protyle-icons">Toolbar</div></div>
        <div class="protyle-background__ia">
          <div class="protyle-background__icon">Icon</div>
          <div class="b3-chips b3-chips__doctag">Tags</div>
          <div class="protyle-background__action">Actions</div>
        </div>
      </div>
    </div>`;
  return document.querySelector<HTMLElement>(".protyle")!;
}

describe("more-background cover layout", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("places the native toolbar below the title icon and above tags and add actions", () => {
    const root = renderHeader();
    const toolbar = root.querySelector<HTMLElement>(".protyle-icons")!;
    const cleanup = applyCoverLayout(root, { toolbarPosition: "belowIcon" });
    const infoChildren = [...root.querySelector(".protyle-background__ia")!.children];

    expect(toolbar.dataset.damophusCoverToolbar).toBe("belowIcon");
    expect(infoChildren.map((element) => element.className)).toEqual([
      "protyle-background__icon",
      "protyle-icons",
      "b3-chips b3-chips__doctag",
      "protyle-background__action",
    ]);

    cleanup();
    expect(toolbar.parentElement?.className).toBe("protyle-background__img");
  });

  it("keeps custom coordinates inside the cover and configures independent cover layers", () => {
    const root = renderHeader();
    const toolbar = root.querySelector<HTMLElement>(".protyle-icons")!;
    applyCoverLayout(root, {
      toolbarPosition: "custom",
      toolbarCustomX: 100,
      toolbarCustomY: -10,
      coverBreadcrumb: true,
      coverDocumentMenu: false,
    });

    expect(toolbar.style.getPropertyValue("--damophus-cover-toolbar-x")).toBe("100%");
    expect(toolbar.style.getPropertyValue("--damophus-cover-toolbar-y")).toBe("0%");
    expect(toolbar.style.getPropertyValue("--damophus-cover-toolbar-offset-x")).toBe("-100%");
    expect(root.dataset.damophusCoverLayer).toBe("raised");
    expect(root.dataset.damophusCoverBreadcrumb).toBe("cover");
    expect(root.dataset.damophusCoverMenu).toBe("preserve");
  });
});
