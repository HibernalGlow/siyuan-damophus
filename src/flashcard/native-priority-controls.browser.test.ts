import { afterEach, describe, expect, it, vi } from "vitest";
import { NativePriorityControls } from "./native-priority-controls";

let controls: NativePriorityControls | undefined;

afterEach(() => {
  controls?.uninstall();
  controls = undefined;
  document.body.innerHTML = "";
});

function cardRoot(mobile: boolean): HTMLElement {
  const root = document.createElement("div");
  root.className = "card__main";
  root.innerHTML = `
    <div class="${mobile ? "toolbar" : "block__icons"}">
      <${mobile ? "svg" : "button"} data-type="filter"></${mobile ? "svg" : "button"}>
    </div>
    <div class="card__block"><div data-node-id="20260823120000-aaaaaaa"></div></div>
    <div class="card__action"><button data-type="-3"></button></div>`;
  document.body.append(root);
  return root;
}

describe("native flashcard toolbar", () => {
  it.each([false, true])("attaches native icon actions on %s layout", async (mobile) => {
    cardRoot(mobile);
    const locate = vi.fn();
    const openWorkbench = vi.fn();
    controls = new NativePriorityControls({
      documentRef: document,
      getSettings: () => ({ enabled: true, locate: true, unregister: true, priority: true, workbench: true, renderer: true, more: true }),
      getCurrentCard: () => ({ blockID: "20260823120000-aaaaaaa", cardID: "card-1" }),
      setPriority: vi.fn(async () => "native" as const),
      locate,
      unregister: vi.fn(async () => false),
      openWorkbench,
      isRendererOverrideEnabled: () => true,
      toggleRendererOverride: vi.fn(),
      getRendererVisibility: () => ({ mark: true, list: true, heading: true, superBlock: true, blockquote: true, callout: true, tag: false }),
      toggleRendererVisibility: vi.fn(),
      toggleToolVisibility: vi.fn(),
    });

    controls.install();
    await vi.waitFor(() => expect(document.querySelectorAll("[data-damophus-flashcard-tool]")).toHaveLength(6));
    document.querySelector<HTMLElement>('[data-damophus-flashcard-tool="iconFocus"]')?.click();
    document.querySelector<HTMLElement>('[data-damophus-flashcard-tool="iconSettings"]')?.click();

    await vi.waitFor(() => expect(locate).toHaveBeenCalled());
    expect(openWorkbench).toHaveBeenCalled();
    const tools = [...document.querySelectorAll<HTMLElement>("[data-damophus-flashcard-tool]")];
    expect(tools.every((tool) => tool.tagName === (mobile ? "svg" : "BUTTON").toUpperCase())).toBe(true);
  });

  it("removes actions when the workbench switch disables the toolbar", async () => {
    cardRoot(false);
    let enabled = true;
    controls = new NativePriorityControls({
      documentRef: document,
      getSettings: () => ({ enabled, locate: true, unregister: true, priority: true, workbench: true, renderer: true, more: true }),
      getCurrentCard: () => ({ blockID: "20260823120000-aaaaaaa", cardID: "card-1" }),
      setPriority: vi.fn(async () => "native" as const),
      locate: vi.fn(),
      unregister: vi.fn(async () => false),
      openWorkbench: vi.fn(),
      isRendererOverrideEnabled: () => true,
      toggleRendererOverride: vi.fn(),
      getRendererVisibility: () => ({ mark: true, list: true, heading: true, superBlock: true, blockquote: true, callout: true, tag: false }),
      toggleRendererVisibility: vi.fn(),
      toggleToolVisibility: vi.fn(),
    });
    controls.install();
    await vi.waitFor(() => expect(document.querySelectorAll("[data-damophus-flashcard-tool]")).toHaveLength(6));

    enabled = false;
    controls.refresh();

    expect(document.querySelectorAll("[data-damophus-flashcard-tool]")).toHaveLength(0);
  });
});
