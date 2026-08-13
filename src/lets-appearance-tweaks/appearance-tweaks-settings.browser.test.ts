import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { mount, unmount } from "svelte";
import AppearanceTweaksSettings from "./AppearanceTweaksSettings.svelte";
import pluginMetadata from "./plugin";

const mounted: Record<string, unknown>[] = [];
const labels = {
  preview: "Live preview",
  previewDescription: "Updates immediately",
  sampleText: "Study note",
  sampleTag: "law",
  sampleReference: "source",
  sampleSubReference: "note",
  refCount: "2 references",
};

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.innerHTML = "";
});

describe("appearance tweaks settings", () => {
  it("renders tag and reference previews from configured values", () => {
    const component = mount(AppearanceTweaksSettings, {
      target: document.body,
      props: { group: "appearanceTweaks", title: "Appearance", labels, settingItems: pluginMetadata.settings as ISettingItem[] },
    });
    mounted.push(component);
    const preview = document.querySelector<HTMLElement>("[data-appearance-tweaks-preview]")!;
    const tag = preview.querySelector<HTMLElement>(".preview-tag")!;
    const reference = preview.querySelector<HTMLElement>(".preview-reference")!;
    expect(getComputedStyle(tag).fontSize).not.toBe(getComputedStyle(reference).fontSize);
    expect(getComputedStyle(tag).borderRadius).toBe("3px");
    expect(getComputedStyle(reference).borderRadius).toBe("5px");
    expect(preview.querySelectorAll('.preview-reference[data-type*="block-ref"]')).toHaveLength(2);
    expect(preview.querySelector(".protyle-attr--refcount")).not.toBeNull();
  });

  it("updates the shared preview during slider movement and commits afterward", async () => {
    const previewEvent = vi.fn();
    const changed = vi.fn();
    const component = mount(AppearanceTweaksSettings, {
      target: document.body,
      props: { group: "appearanceTweaks", title: "Appearance", labels, settingItems: pluginMetadata.settings as ISettingItem[] },
      events: { preview: previewEvent, changed },
    });
    mounted.push(component);

    const tagFontOutput = Array.from(document.querySelectorAll<HTMLOutputElement>("output"))
      .find((element) => element.textContent?.trim() === "90")!;
    const slider = tagFontOutput.parentElement!.querySelector<HTMLElement>('[data-slot="slider-thumb"]')!;
    await userEvent.click(slider);
    await userEvent.keyboard("{ArrowRight}");
    await vi.waitFor(() => expect(
      document.querySelector<HTMLElement>("[data-appearance-tweaks-preview]")?.style.getPropertyValue("--preview-tag-font-size"),
    ).toBe("91%"));
    expect(previewEvent).toHaveBeenCalled();
    expect(changed).toHaveBeenCalled();
  });

  it("previews the independent online mobile editor font size", () => {
    const settingItems = (pluginMetadata.settings as ISettingItem[]).map((item) => {
      if (item.key === "browserMobileFontSize") return { ...item, value: true };
      if (item.key === "browserMobileEditorFontSize") return { ...item, value: 23 };
      return item;
    });
    const component = mount(AppearanceTweaksSettings, {
      target: document.body,
      props: { group: "appearanceTweaks", title: "Appearance", labels, settingItems },
    });
    mounted.push(component);

    const preview = document.querySelector<HTMLElement>("[data-appearance-tweaks-preview]")!;
    expect(preview.style.getPropertyValue("--preview-editor-font-size")).toBe("23px");
    expect(getComputedStyle(preview.querySelector<HTMLElement>(".preview-line")!).fontSize).toBe("23px");
  });
});
