import { mount, tick, unmount } from "svelte";
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import CommandSelect from "./CommandSelect.svelte";
import type { CommandOption } from "./runtime";

const labels = { search: "搜索命令…", empty: "没有匹配的命令" };

const options: CommandOption[] = [
  { value: "editor::general::redo", label: "重做 (常规)", available: true, group: "general", groupLabel: "常规" },
  { value: "editor::general::undo", label: "撤销 (常规)", available: true, group: "general", groupLabel: "常规" },
  { value: "editor::heading::moveUp", label: "上移标题 (标题)", available: false, group: "heading", groupLabel: "标题" },
  { value: "plugin::snippets::open", label: "代码片段管理器: 打开", available: true, group: "snippets", groupLabel: "代码片段管理器" },
];

let component: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  document.body.innerHTML = "";
});

function render(props: Record<string, unknown> = {}) {
  const target = document.createElement("div");
  target.className = "damophus-theme-root damophus-question-bank-theme";
  document.body.append(target);
  component = mount(CommandSelect, {
    target,
    props: { options, value: "editor::general::redo", labels, ...props },
  });
  return target;
}

function trigger() {
  return document.querySelector<HTMLButtonElement>('[data-slot="combobox-trigger"]')!;
}

function groupHeadings() {
  return [...document.querySelectorAll<HTMLElement>('[data-slot="combobox-group-heading"]')].map(
    (heading) => heading.textContent?.trim(),
  );
}

function itemTexts() {
  return [...document.querySelectorAll<HTMLElement>('[data-slot="combobox-item"]')].map(
    (item) => item.textContent?.trim(),
  );
}

describe("command select", () => {
  it("shows the selected command label on the closed trigger", async () => {
    render();
    await tick();

    expect(trigger().textContent).toContain("重做 (常规)");
    expect(document.querySelector('[data-slot="combobox-content"]')).toBeNull();
  });

  it("opens a grouped list with a search box", async () => {
    render();
    await tick();

    await userEvent.click(trigger());
    await tick();

    expect(new Set(groupHeadings())).toEqual(new Set(["常规", "标题", "代码片段管理器"]));
    expect(itemTexts()).toEqual([
      "上移标题 (标题)",
      "重做 (常规)",
      "撤销 (常规)",
      "代码片段管理器: 打开",
    ]);
    expect(document.querySelector<HTMLInputElement>('[data-slot="combobox-input"]')).not.toBeNull();
  });

  it("filters commands across labels and groups, and shows the empty state", async () => {
    render();
    await tick();

    await userEvent.click(trigger());
    const input = document.querySelector<HTMLInputElement>('[data-slot="combobox-input"]')!;
    await userEvent.fill(input, "代码片段");
    await tick();

    expect(groupHeadings()).toEqual(["代码片段管理器"]);
    expect(itemTexts()).toEqual(["代码片段管理器: 打开"]);

    await userEvent.fill(input, "zzz");
    await tick();
    expect(document.body.textContent).toContain(labels.empty);

    // The group name itself is searchable too.
    await userEvent.fill(input, "标题");
    await tick();
    expect(itemTexts()).toEqual(["上移标题 (标题)"]);
  });

  it("reports the picked command", async () => {
    const onValueChange = vi.fn();
    render({ onValueChange });
    await tick();

    await userEvent.click(trigger());
    const input = document.querySelector<HTMLInputElement>('[data-slot="combobox-input"]')!;
    await userEvent.fill(input, "撤销");
    await tick();
    await userEvent.keyboard("{Enter}");

    expect(onValueChange).toHaveBeenCalledWith("editor::general::undo");
  });
});
