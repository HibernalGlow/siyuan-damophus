import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyThemeVariables } from "@/theme/runtime";
import { BUILTIN_THEMES } from "@/theme/themes";
import BlockAttributeSettings from "./BlockAttributeSettings.svelte";
import {
  DEFAULT_CUSTOM_PROPERTIES,
  DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
  DEFAULT_CUSTOM_PROPERTY_STYLE,
} from "./custom-properties";

let mounted: ReturnType<typeof mount>[] = [];

const labels = {
  preview: "Marker preview",
  previewWidth: "Preview width",
  properties: "Displayed properties",
  availableProperties: "Available properties",
  property: "Property",
  enabled: "Show",
  showLabel: "Label",
  label: "Display name",
  addProperty: "Add property",
  invalidProperty: "Enter a safe displayable property",
  blockTypes: "Block types",
  blockTypeDocument: "Document",
  blockTypeHeading: "Heading",
  blockTypeParagraph: "Paragraph",
  blockTypeList: "List",
  blockTypeListItem: "List item",
  blockTypeBlockquote: "Blockquote",
  blockTypeSuperBlock: "Super block",
  blockTypeTable: "Table",
  advanced: "Advanced appearance",
  customCss: "Marker style",
  customCssDescription: "Safe declarations only",
};

afterEach(async () => {
  await Promise.all(mounted.map((component) => unmount(component)));
  mounted = [];
  document.body.innerHTML = "";
});

function render(events: Record<string, (event: CustomEvent) => void> = {}) {
  const target = document.createElement("div");
  target.className = "damophus-theme-root";
  applyThemeVariables(target, BUILTIN_THEMES[0], "light");
  document.body.appendChild(target);
  mounted.push(mount(BlockAttributeSettings, {
    target,
    props: {
      customProperties: `${DEFAULT_CUSTOM_PROPERTIES}\ncustom-qb-answer|answer`,
      customPropertyBlockTypes: DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
      customStyle: DEFAULT_CUSTOM_PROPERTY_STYLE,
      theme: BUILTIN_THEMES[0],
      mode: "light",
      labels,
    },
    events,
  }));
  return target;
}

function row(name: string): HTMLElement {
  const match = [...document.querySelectorAll<HTMLElement>("label")].find(
    (candidate) => candidate.textContent?.includes(name),
  );
  if (!match) throw new Error(`Missing row: ${name}`);
  return match;
}

describe("structured block attribute settings", () => {
  it("shows safe defaults, leaves tables off, and never renders the answer property", async () => {
    const target = render();
    await tick();

    expect(target.textContent).toContain("custom-qb-id");
    expect(target.textContent).toContain("custom-qb-type");
    expect(target.textContent).not.toContain("custom-qb-answer");
    expect(row(labels.blockTypeHeading).querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("true");
    expect(row(labels.blockTypeParagraph).querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("true");
    expect(row(labels.blockTypeList).querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("true");
    expect(row(labels.blockTypeTable).querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
  });

  it("previews and commits an edited property label", async () => {
    const preview = vi.fn();
    const changed = vi.fn();
    const target = render({ preview, changed });
    const input = target.querySelector<HTMLInputElement>(`input[aria-label="${labels.label}: custom-qb-id"]`);
    if (!input) throw new Error("Missing property label input");

    input.value = "question-id";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();

    expect(preview.mock.calls.at(-1)?.[0].detail.value).toContain("custom-qb-id|question-id");
    expect(changed.mock.calls.at(-1)?.[0].detail.value).toContain("custom-qb-id|question-id");
  });

  it("rejects the protected answer property and clears the input", async () => {
    const changed = vi.fn();
    const target = render({ changed });
    const input = target.querySelector<HTMLInputElement>('input[placeholder="custom-qb-..."]');
    const add = [...target.querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) => candidate.textContent?.includes(labels.addProperty),
    );
    if (!input || !add) throw new Error("Missing custom property controls");

    input.value = "custom-qb-answer";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    add.click();
    await tick();

    expect(input.value).toBe("");
    expect(target.textContent).not.toContain("custom-qb-answer");
    expect(target.textContent).toContain(labels.invalidProperty);
    expect(changed).not.toHaveBeenCalled();
  });
});
