import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import {
  applyExerciseFocus,
  EXERCISE_CONTAINER_ATTRIBUTE,
  EXERCISE_FOCUS_STYLE_ID,
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

  it("applies a real blur and reveals a hidden block on hover", async () => {
    renderEditor();
    const controller = new ExerciseFocusController(document);
    controllers.add(controller);
    controller.start({ blurRadius: 7 });
    const answer = document.querySelector<HTMLElement>('[data-node-id="answer"]')!;

    expect(getComputedStyle(answer).filter).toBe("blur(7px)");
    await page.getByText("Answer and explanation").hover();
    await vi.waitFor(() => expect(answer.dataset.damophusExerciseHovered).toBe("true"));
    await vi.waitFor(() => expect(getComputedStyle(answer).filter).toBe("none"));
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
