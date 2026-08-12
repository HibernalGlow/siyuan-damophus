import { mount, tick, unmount } from "svelte";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import CalloutAppearanceSettings from "./CalloutAppearanceSettings.svelte";
import pluginMetadata from "./plugin";

let mounted: ReturnType<typeof mount>[] = [];

const labels = {
  preview: "Live preview",
  previewDescription: "Nested containment preview",
  outerTitle: "Important",
  outerBody: "Outer Callout body",
  nestedTitle: "Tip",
  nestedBody: "Nested Callout body",
};

afterEach(async () => {
  await Promise.all(mounted.map((component) => unmount(component)));
  mounted = [];
  document.body.innerHTML = "";
});

function render(changed = vi.fn()) {
  const target = document.createElement("div");
  target.className = "damophus-theme-root damophus-question-bank-theme";
  target.style.width = "560px";
  document.body.append(target);
  mounted.push(mount(CalloutAppearanceSettings, {
    target,
    props: {
      group: "Callout appearance",
      title: "Callout appearance",
      labels,
      moduleSettingItems: [{
        type: "checkbox",
        title: "Enabled",
        description: "Enable this module",
        key: "enabled",
        value: true,
      }],
      settingItems: pluginMetadata.settings!.map((item) => ({
        ...item,
        value: item.value ?? "",
      })),
    },
    events: { changed },
  }));
  return { target, changed };
}

describe("Callout appearance settings", () => {
  it("renders a live nested preview without horizontal overflow", async () => {
    await page.viewport(620, 800);
    const { target } = render();
    await tick();

    const preview = target.querySelector<HTMLElement>("[data-callout-appearance-preview]");
    const callouts = target.querySelectorAll<HTMLElement>("[data-callout-appearance-preview] .callout");
    const outerContent = callouts[0]?.querySelector<HTMLElement>(":scope > .callout-content");
    const listAction = target.querySelector<HTMLElement>("[data-callout-appearance-preview] .protyle-action");
    if (!preview || callouts.length !== 2 || !outerContent || !listAction) {
      throw new Error("Missing list-nested Callout preview");
    }

    expect(target.textContent).toContain(labels.preview);
    expect(target.textContent).toContain(labels.nestedBody);
    expect(target.textContent).not.toContain("Enabled");
    expect(getComputedStyle(callouts[0]).paddingTop).toBe("16px");
    expect(getComputedStyle(callouts[0]).borderRadius).toBe("11px");
    expect(getComputedStyle(callouts[1]).maxWidth).toBe("100%");
    expect(getComputedStyle(callouts[1]).marginLeft).toBe("34px");
    expect(callouts[1].getBoundingClientRect().left)
      .toBeGreaterThanOrEqual(listAction.getBoundingClientRect().right - 0.5);
    expect(callouts[1].getBoundingClientRect().right)
      .toBeLessThanOrEqual(outerContent.getBoundingClientRect().right + 0.5);
    expect(preview.scrollWidth).toBeLessThanOrEqual(preview.clientWidth);
  });

  it("updates the preview immediately when a slider changes", async () => {
    const { target, changed } = render();
    await tick();
    const slider = target.querySelector<HTMLElement>('[role="slider"]');
    if (!slider) throw new Error("Missing top padding slider");

    slider.focus();
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await tick();

    const preview = target.querySelector<HTMLElement>("[data-callout-appearance-preview]");
    const outer = target.querySelector<HTMLElement>("[data-callout-appearance-preview] > .callout");
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({ key: "paddingTop", value: 17 }),
    }));
    expect(preview?.getAttribute("style")).toContain("--preview-padding-top: 17px");
    expect(getComputedStyle(preview!).getPropertyValue("--preview-padding-top").trim()).toBe("17px");
    expect(getComputedStyle(outer!).paddingTop).toBe("17px");
  });

  it("previews optional body text tinting without leaking the outer type color", async () => {
    const { target, changed } = render();
    await tick();
    const preview = target.querySelector<HTMLElement>("[data-callout-appearance-preview]");
    const callouts = target.querySelectorAll<HTMLElement>("[data-callout-appearance-preview] .callout");
    const outerParagraph = target.querySelector<HTMLElement>(
      '[data-callout-appearance-preview] .p[data-type="NodeParagraph"]',
    );
    const nestedParagraph = callouts[1]?.querySelector<HTMLElement>(":scope > .callout-content > p");
    const toggle = target.querySelector<HTMLButtonElement>(
      '[role="switch"][aria-label="lets-callout-appearance.followCalloutTextColorTitle"]',
    );
    if (!preview || callouts.length !== 2 || !outerParagraph || !nestedParagraph || !toggle) {
      throw new Error("Missing Callout text color preview controls");
    }

    expect(preview.classList.contains("follow-callout-text-color")).toBe(false);
    expect(getComputedStyle(outerParagraph).color).not.toBe(getComputedStyle(callouts[0]).color);

    toggle.click();
    await tick();

    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({ key: "followCalloutTextColor", value: true }),
    }));
    expect(preview.classList.contains("follow-callout-text-color")).toBe(true);
    expect(getComputedStyle(outerParagraph).color).toBe(getComputedStyle(callouts[0]).color);
    expect(getComputedStyle(nestedParagraph).color).toBe(getComputedStyle(callouts[1]).color);
    expect(getComputedStyle(outerParagraph).color).not.toBe(getComputedStyle(nestedParagraph).color);
  });
});
