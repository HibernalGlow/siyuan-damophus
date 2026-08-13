import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import SourceAnswerMaskSettings from "./SourceAnswerMaskSettings.svelte";

let component: ReturnType<typeof mount> | undefined;

const labels = {
  title: "Source answer masking",
  description: "Hide source answers without changing content",
  enabled: "Hide source answers",
  style: "Mask style",
  preview: "Preview",
  answerPrefix: "Answer: ",
  blur: "Blur",
  solid: "Solid cover",
  underline: "Underline cover",
};

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  document.body.innerHTML = "";
});

describe("source answer mask settings", () => {
  it("previews styles and reports persisted setting changes", async () => {
    const changed = vi.fn();
    const preview = vi.fn();
    component = mount(SourceAnswerMaskSettings, {
      target: document.body,
      props: { enabled: false, style: "blur", labels },
      events: { changed, preview },
    });

    const switchElement = document.querySelector<HTMLElement>('[role="switch"]');
    const selectTrigger = document.querySelector<HTMLElement>('#damophus-answer-mask-style');
    if (!switchElement || !selectTrigger) throw new Error("Missing answer mask controls");
    switchElement.click();
    selectTrigger.click();
    await tick();
    const solidOption = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => item.textContent?.includes(labels.solid));
    if (!solidOption) throw new Error("Missing solid mask option");
    solidOption.click();
    await tick();

    expect(document.querySelectorAll('[data-preview-style="solid"]')).toHaveLength(2);
    expect(changed.mock.calls.map((call) => call[0].detail)).toContainEqual({ key: "maskSourceAnswers", value: true });
    expect(changed.mock.calls.map((call) => call[0].detail)).toContainEqual({ key: "answerMaskStyle", value: "solid" });
  });
});
