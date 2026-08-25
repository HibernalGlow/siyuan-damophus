import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyExerciseFocus,
  EXERCISE_CONTAINER_ATTRIBUTE,
  EXERCISE_EDITING_ATTRIBUTE,
  EXERCISE_FOCUS_STYLE_ID,
  EXERCISE_MASK_GROUP_ATTRIBUTE,
  EXERCISE_MASK_ROLE_ATTRIBUTE,
  EXERCISE_REVEALED_ATTRIBUTE,
  EXERCISE_VISIBILITY_ATTRIBUTE,
  ExerciseFocusController,
} from "./exercise-focus";

const controllers = new Set<ExerciseFocusController>();

afterEach(() => {
  controllers.forEach((controller) => controller.destroy());
  controllers.clear();
  document.body.innerHTML = "";
  document.getElementById(EXERCISE_FOCUS_STYLE_ID)?.remove();
});

function renderEditor(): HTMLElement {
  document.body.innerHTML = `
    <div class="protyle-wysiwyg">
      <div data-node-id="outside" data-type="NodeParagraph">Outside answer</div>
      <div data-node-id="quote" data-type="NodeBlockquote">
        <div class="bq">
          <div class="h6" data-node-id="heading" data-type="NodeHeading" data-subtype="h6">\u4e60\u9898</div>
          <div data-node-id="stem" data-type="NodeCodeBlock"><div>Question stem</div></div>
          <div data-node-id="answer" data-type="NodeParagraph">Answer and explanation</div>
          <div data-node-id="list" data-type="NodeList"><div data-node-id="item" data-type="NodeListItem">Nested details</div></div>
        </div>
      </div>
    </div>`;
  return document.querySelector<HTMLElement>(".protyle-wysiwyg")!;
}

describe("exercise focus", () => {
  it("keeps the matching heading and configured block types visible", () => {
    const root = renderEditor();
    applyExerciseFocus(root);

    const quote = root.querySelector<HTMLElement>('[data-node-id="quote"]')!;
    const visibility = (id: string) => root.querySelector<HTMLElement>(`[data-node-id="${id}"]`)?.getAttribute(EXERCISE_VISIBILITY_ATTRIBUTE);
    expect(quote.getAttribute(EXERCISE_CONTAINER_ATTRIBUTE)).toBe("true");
    expect(visibility("heading")).toBe("visible");
    expect(visibility("stem")).toBe("visible");
    expect(visibility("answer")).toBe("hidden");
    expect(visibility("list")).toBe("hidden");
    expect(visibility("item")).toBeNull();
    expect(visibility("outside")).toBeNull();
  });

  it("supports QUESTION callouts while preserving their title and configured stem blocks", () => {
    const root = renderEditor();
    root.insertAdjacentHTML("beforeend", `
      <div class="callout" data-node-id="question-callout" data-type="NodeCallout" data-subtype="QUESTION">
        <div class="callout-info"><span class="callout-icon">\u270f\ufe0f</span><span class="callout-title">\u68c0\u5bdf\u9662\u63a7\u8bc9\u804c\u80fd\u4e0e\u76d1\u7763\u804c\u80fd\u7684\u533a\u5206</span></div>
        <div class="callout-content">
          <div data-node-id="question-stem" data-type="NodeCodeBlock"><div>[\u5224\u65ad] \u2462</div></div>
          <div data-node-id="question-answer" data-type="NodeParagraph">\u6b63\u786e\u3002\u4f53\u73b0\u6c42\u5211\u3002</div>
          <div data-node-id="question-list" data-type="NodeList"><div data-node-id="question-item" data-type="NodeListItem">\u89e3\u6790\u7ec6\u8282</div></div>
        </div>
        <div class="protyle-attr" contenteditable="false"></div>
      </div>`);

    applyExerciseFocus(root);

    const callout = root.querySelector<HTMLElement>('[data-node-id="question-callout"]')!;
    expect(callout.getAttribute(EXERCISE_CONTAINER_ATTRIBUTE)).toBe("true");
    expect(callout.querySelector(":scope > .callout-info .callout-title")?.textContent).toContain("\u68c0\u5bdf\u9662\u63a7\u8bc9\u804c\u80fd");
    expect(root.querySelector<HTMLElement>('[data-node-id="question-stem"]')?.getAttribute(EXERCISE_VISIBILITY_ATTRIBUTE)).toBe("visible");
    expect(root.querySelector<HTMLElement>('[data-node-id="question-answer"]')?.getAttribute(EXERCISE_VISIBILITY_ATTRIBUTE)).toBe("hidden");
    expect(root.querySelector<HTMLElement>('[data-node-id="question-list"]')?.getAttribute(EXERCISE_VISIBILITY_ATTRIBUTE)).toBe("hidden");
  });

  it("does not treat other callout types as exercises", () => {
    const root = renderEditor();
    root.insertAdjacentHTML("beforeend", `
      <div class="callout" data-node-id="note-callout" data-type="NodeCallout" data-subtype="NOTE">
        <div class="callout-info"><span class="callout-title">\u666e\u901a\u7b14\u8bb0</span></div>
        <div class="callout-content"><div data-node-id="note-body" data-type="NodeParagraph">\u6b63\u6587</div></div>
      </div>`);

    applyExerciseFocus(root);

    expect(root.querySelector<HTMLElement>('[data-node-id="note-callout"]')?.hasAttribute(EXERCISE_CONTAINER_ATTRIBUTE)).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-node-id="note-body"]')?.hasAttribute(EXERCISE_VISIBILITY_ATTRIBUTE)).toBe(false);
  });

  it("requires both the configured heading text and level", () => {
    const root = renderEditor();
    applyExerciseFocus(root, { headingLevel: "h5" });
    expect(root.querySelector(`[${EXERCISE_CONTAINER_ATTRIBUTE}]`)).toBeNull();

    applyExerciseFocus(root, { headingText: "Practice", visibleBlockTypes: ["NodeParagraph"] });
    expect(root.querySelector(`[${EXERCISE_CONTAINER_ATTRIBUTE}]`)).toBeNull();
  });

  it("ignores SiYuan zero-width block attribute placeholders in headings", () => {
    const root = renderEditor();
    const heading = root.querySelector<HTMLElement>('[data-node-id="heading"]');
    if (!heading) throw new Error("Missing heading fixture");
    heading.append(document.createTextNode("\u200B"));
    applyExerciseFocus(root);
    expect(root.querySelector(`[${EXERCISE_CONTAINER_ATTRIBUTE}]`)).not.toBeNull();
  });

  it("gives short and multi-block answers the same concealed height", () => {
    const root = renderEditor();
    root.insertAdjacentHTML("beforeend", `
      <div data-node-id="quote-short" data-type="NodeBlockquote"><div class="bq">
        <div class="h6" data-node-id="heading-short" data-type="NodeHeading" data-subtype="h6">\u4e60\u9898</div>
        <div data-node-id="stem-short" data-type="NodeCodeBlock"><div>Short stem</div></div>
        <div data-node-id="answer-short" data-type="NodeParagraph">\u6b63\u786e</div>
      </div></div>`);
    const controller = new ExerciseFocusController(document);
    controllers.add(controller);
    controller.start({ maskHeight: 80 });

    const answer = document.querySelector<HTMLElement>('[data-node-id="answer"]')!;
    const list = document.querySelector<HTMLElement>('[data-node-id="list"]')!;
    const shortAnswer = document.querySelector<HTMLElement>('[data-node-id="answer-short"]')!;
    expect(answer.getAttribute(EXERCISE_MASK_ROLE_ATTRIBUTE)).toBe("lead");
    expect(list.getAttribute(EXERCISE_MASK_ROLE_ATTRIBUTE)).toBe("member");
    expect(answer.getAttribute(EXERCISE_MASK_GROUP_ATTRIBUTE)).toBe(list.getAttribute(EXERCISE_MASK_GROUP_ATTRIBUTE));
    expect(getComputedStyle(answer).height).toBe("80px");
    expect(getComputedStyle(shortAnswer).height).toBe("80px");
    expect(getComputedStyle(list).display).toBe("none");
    expect(getComputedStyle(answer).filter).toBe("none");
    expect(getComputedStyle(answer).color).toBe("rgba(0, 0, 0, 0)");
  });

  it("reveals and restores a complete hidden group on hover", async () => {
    renderEditor();
    const controller = new ExerciseFocusController(document);
    controllers.add(controller);
    controller.start({ maskHeight: 72 });
    const answer = document.querySelector<HTMLElement>('[data-node-id="answer"]')!;
    const list = document.querySelector<HTMLElement>('[data-node-id="list"]')!;

    answer.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await vi.waitFor(() => expect(answer.getAttribute(EXERCISE_REVEALED_ATTRIBUTE)).toBe("true"));
    expect(list.getAttribute(EXERCISE_REVEALED_ATTRIBUTE)).toBe("true");
    expect(getComputedStyle(list).display).not.toBe("none");

    answer.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    await vi.waitFor(() => expect(answer.hasAttribute(EXERCISE_REVEALED_ATTRIBUTE)).toBe(false));
    expect(list.hasAttribute(EXERCISE_REVEALED_ATTRIBUTE)).toBe(false);
    expect(getComputedStyle(list).display).toBe("none");
  });

  it("keeps a clicked answer open while SiYuan mutates its content", async () => {
    renderEditor();
    const controller = new ExerciseFocusController(document);
    controllers.add(controller);
    controller.start({ maskHeight: 72 });
    const answer = document.querySelector<HTMLElement>('[data-node-id="answer"]')!;

    answer.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    answer.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(answer.getAttribute(EXERCISE_EDITING_ATTRIBUTE)).toBe("true");

    answer.append(document.createTextNode(" edited"));
    await vi.waitFor(() => expect(answer.getAttribute(EXERCISE_REVEALED_ATTRIBUTE)).toBe("true"));
    expect(answer.getAttribute(EXERCISE_EDITING_ATTRIBUTE)).toBe("true");

    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await vi.waitFor(() => expect(answer.hasAttribute(EXERCISE_REVEALED_ATTRIBUTE)).toBe(false));
    expect(answer.hasAttribute(EXERCISE_EDITING_ATTRIBUTE)).toBe(false);
  });

  it("updates a lazily loaded exercise and removes all state when stopped", async () => {
    document.body.innerHTML = '<div class="protyle-wysiwyg"></div>';
    const controller = new ExerciseFocusController(document);
    controllers.add(controller);
    controller.start();
    const root = document.querySelector<HTMLElement>(".protyle-wysiwyg")!;
    root.innerHTML = `
      <div data-node-id="quote" data-type="NodeBlockquote"><div class="bq">
        <div class="h6" data-node-id="heading" data-type="NodeHeading" data-subtype="h6">\u4e60\u9898</div>
        <div data-node-id="answer" data-type="NodeParagraph">Deferred answer</div>
      </div></div>`;

    await vi.waitFor(() => expect(root.querySelector(`[${EXERCISE_CONTAINER_ATTRIBUTE}]`)).not.toBeNull());
    controller.destroy();
    expect(document.querySelector(`[${EXERCISE_CONTAINER_ATTRIBUTE}]`)).toBeNull();
    expect(document.querySelector(`[${EXERCISE_VISIBILITY_ATTRIBUTE}]`)).toBeNull();
    expect(document.getElementById(EXERCISE_FOCUS_STYLE_ID)).toBeNull();
  });
});
