import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, unmount } from "svelte";
import SettingItem from "./setting-item.svelte";

const mounted: Record<string, unknown>[] = [];
afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  document.body.innerHTML = "";
});

describe("setting item live preview events", () => {
  it("previews text input changes and commits the final value", async () => {
    const preview = vi.fn();
    const changed = vi.fn();
    mounted.push(mount(SettingItem, {
      target: document.body,
      props: { type: "textinput", title: "Name", description: "", settingKey: "name", settingValue: "abc", placeholder: "" },
      events: { preview, changed },
    }));
    const input = document.querySelector<HTMLInputElement>('input[data-slot="input"]');
    if (!input) throw new Error("Missing text input");
    input.value = "abc2";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => expect(preview).toHaveBeenCalled());
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({ key: "name", value: "abc2" }),
    }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({ key: "name", value: "abc2" }),
    }));
  });
});
