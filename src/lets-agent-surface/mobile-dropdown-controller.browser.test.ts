import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { MobileAgentDropdownController } from "./mobile-dropdown-controller";
import "./agent-surface.css";

const labels = {
  resize: "Resize Agent window",
  pin: "Pin window",
  unpin: "Unpin window",
};

function renderDropdown() {
  const model = document.createElement("section");
  model.id = "model";
  model.className = "damophus-agent-dropdown-mobile";
  model.innerHTML = `
    <div class="toolbar"><span class="toolbar__text">Agent</span></div>
    <main id="modelMain">
      <section class="sy__agentChat">
        <div class="agent-chat">
          <div class="block__icons" style="display: flex; align-items: center; height: 42px">
            <div class="block__logo fn__flex-1 agent-chat__title" style="flex: 1">Agent</div>
            <span class="block__icon" data-type="new-session">New</span>
            <span class="block__icon" data-type="session-menu">Sessions</span>
            <span class="block__icon" data-type="min">Close</span>
          </div>
          <div data-content>Conversation</div>
        </div>
      </section>
    </main>`;
  const nativeClose = document.createElement("button");
  nativeClose.id = "modelClose";
  document.body.append(model, nativeClose);
  const controller = new MobileAgentDropdownController({ labels });
  controller.attach(model);
  return { model, nativeClose, controller };
}

afterEach(() => document.body.replaceChildren());

describe("MobileAgentDropdownController", () => {
  it("starts pinned and blocks horizontal swipe gestures until unpinned", async () => {
    const { model, controller } = renderDropdown();
    const content = model.querySelector<HTMLElement>("[data-content]")!;
    const bubbled = vi.fn();
    document.body.addEventListener("pointermove", bubbled);

    expect(model.classList.contains("damophus-agent-dropdown-pinned")).toBe(true);
    expect(getComputedStyle(model).transform).not.toBe("none");
    const pin = model.querySelector<HTMLButtonElement>('[aria-label="Unpin window"]')!;
    const agentToolbar = model.querySelector<HTMLElement>(".sy__agentChat .block__icons")!;
    expect(pin.closest(".block__icons")).toBe(agentToolbar);
    expect(model.querySelector(":scope > .damophus-agent-dropdown-controls-host")).toBeNull();
    expect(agentToolbar.getBoundingClientRect().height).toBe(42);
    expect(pin.getAttribute("aria-pressed")).toBe("true");

    content.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 1,
      pointerType: "touch",
      clientX: 40,
      clientY: 120,
    }));
    const blocked = content.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "touch",
      clientX: 100,
      clientY: 124,
    }));
    expect(blocked).toBe(false);
    expect(bubbled).not.toHaveBeenCalled();
    content.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "touch",
      clientX: 100,
      clientY: 124,
    }));

    content.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 2,
      pointerType: "touch",
      clientX: 40,
      clientY: 120,
    }));
    content.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      pointerId: 2,
      pointerType: "touch",
      clientX: 44,
      clientY: 180,
    }));
    expect(bubbled).toHaveBeenCalledOnce();
    bubbled.mockClear();

    await userEvent.click(pin);
    expect(model.classList.contains("damophus-agent-dropdown-pinned")).toBe(false);
    expect(getComputedStyle(model).transform).toBe("none");
    bubbled.mockClear();
    content.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "touch",
      clientX: 150,
      clientY: 125,
    }));
    expect(bubbled).toHaveBeenCalledOnce();
    controller.stop();
  });

  it("resizes from the top handle and supports keyboard adjustment", async () => {
    await page.viewport(390, 800);
    const { model, controller } = renderDropdown();
    const handle = model.querySelector<HTMLButtonElement>('[role="slider"]')!;

    handle.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 7,
      pointerType: "touch",
      clientY: 160,
    }));
    window.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      pointerId: 7,
      pointerType: "touch",
      clientY: 280,
    }));
    window.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 7,
      pointerType: "touch",
      clientY: 280,
    }));

    expect(model.style.getPropertyValue("--damophus-agent-dropdown-height")).toBe("65dvh");
    handle.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, key: "ArrowUp"}));
    expect(model.style.getPropertyValue("--damophus-agent-dropdown-height")).toBe("70dvh");
    controller.stop();
  });

  it("uses the existing native close controls and reapplies the remembered pin on reopen", () => {
    const { model, nativeClose, controller } = renderDropdown();
    model.querySelector<HTMLElement>('.block__icon[data-type="min"]')!.click();
    expect(model.classList.contains("damophus-agent-dropdown-pinned")).toBe(false);

    controller.attach(model);
    expect(model.classList.contains("damophus-agent-dropdown-pinned")).toBe(true);
    nativeClose.click();
    expect(model.classList.contains("damophus-agent-dropdown-pinned")).toBe(false);

    controller.stop();
    expect(model.querySelector(".damophus-agent-dropdown-controls-host")).toBeNull();
  });
});
