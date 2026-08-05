import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import ThemeSettings from "./ThemeSettings.svelte";
import { applyThemeVariables } from "./runtime";
import { BUILTIN_THEMES, themeId } from "./themes";

let mounted: ReturnType<typeof mount>[] = [];

const labels = {
  builtin: "Built-in themes",
  custom: "Custom themes",
  import: "Import JSON",
  export: "Export custom themes",
  apply: "Apply theme",
  applied: "Applied",
  reset: "Use default",
  remove: "Remove theme",
  empty: "No custom themes",
  importConfirm: "Confirm import",
  importSummary: "{count} valid themes ready",
  invalidFile: "No valid themes found",
};

afterEach(async () => {
  await Promise.all(mounted.map((component) => unmount(component)));
  mounted = [];
  document.body.innerHTML = "";
});

function button(name: string): HTMLButtonElement {
  const match = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === name || candidate.getAttribute("aria-label") === name,
  );
  if (!match) throw new Error(`Missing button: ${name}`);
  return match;
}

function render(options: { customThemes?: typeof BUILTIN_THEMES; events?: Record<string, (event: CustomEvent) => void> } = {}) {
  const target = document.createElement("div");
  target.className = "damophus-theme-root";
  applyThemeVariables(target, BUILTIN_THEMES[0], "light");
  document.body.appendChild(target);
  mounted.push(mount(ThemeSettings, {
    target,
    props: {
      builtinThemes: BUILTIN_THEMES,
      customThemes: options.customThemes ?? [],
      selectedId: themeId(BUILTIN_THEMES[1], "builtin"),
      savedId: themeId(BUILTIN_THEMES[0], "builtin"),
      mode: "light",
      labels,
    },
    events: options.events,
  }));
  return target;
}

async function chooseFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await vi.waitFor(() => expect(document.body.textContent).toContain("valid themes ready"));
}

describe("theme settings", () => {
  it("previews a selected theme and only applies it on command", async () => {
    const select = vi.fn();
    const apply = vi.fn();
    render({ events: { select, apply } });

    button(BUILTIN_THEMES[2].name).click();
    button(labels.apply).click();
    await tick();

    expect(select.mock.calls[0][0].detail.id).toBe(themeId(BUILTIN_THEMES[2], "builtin"));
    expect(apply.mock.calls[0][0].detail.id).toBe(themeId(BUILTIN_THEMES[1], "builtin"));
  });

  it("imports a valid UTF-8 theme after confirmation", async () => {
    const imported = vi.fn();
    const target = render({ events: { import: imported } });
    const input = target.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("Missing theme file input");

    await chooseFile(input, new File([JSON.stringify(BUILTIN_THEMES[0])], "theme.json", { type: "application/json" }));
    button(labels.importConfirm).click();
    await tick();

    expect(imported).toHaveBeenCalledOnce();
    expect(imported.mock.calls[0][0].detail.themes[0].name).toBe(BUILTIN_THEMES[0].name);
  });

  it("rejects malformed UTF-8 without exposing an import action", async () => {
    const imported = vi.fn();
    const target = render({ events: { import: imported } });
    const input = target.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("Missing theme file input");
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File([Uint8Array.from([0xc3, 0x28])], "bad.json", { type: "application/json" })],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(target.textContent).toContain(labels.invalidFile));
    expect(target.textContent).toContain("UTF-8");
    expect(imported).not.toHaveBeenCalled();
  });

  it("dispatches removal for custom themes", async () => {
    const remove = vi.fn();
    const custom = [{ ...BUILTIN_THEMES[0], name: "my-theme" }] as unknown as typeof BUILTIN_THEMES;
    render({ customThemes: custom, events: { remove } });
    button(labels.custom).click();
    await tick();
    button(labels.remove).click();
    expect(remove.mock.calls[0][0].detail.name).toBe("my-theme");
  });
});
