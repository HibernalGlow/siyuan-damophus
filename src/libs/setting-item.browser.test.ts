import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, unmount } from "svelte";
import SettingItem from "./setting-item.svelte";

const mounted: Record<string, unknown>[] = [];
afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.innerHTML = "";
});

describe("setting item live preview events", () => {
  it("previews every slider value change and commits the final value", async () => {
    const preview = vi.fn();
    const changed = vi.fn();
    mounted.push(mount(SettingItem, {
      target: document.body,
      props: { type: "slider", title: "Size", description: "", settingKey: "size", settingValue: 3, slider: { min: 0, max: 10, step: 1 } },
      events: { preview, changed },
    }));
    const slider = document.querySelector<HTMLElement>('[role="slider"]')!;
    slider.focus();
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await vi.waitFor(() => expect(preview).toHaveBeenCalled());
    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({ key: "size", value: 4 }),
    }));
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
