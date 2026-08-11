import "@/styles/damophus.css";
import { describe, expect, it, vi } from "vitest";
import { isolatePortaledSelectGestures } from "./select-gesture-isolation";

describe("select content portal styling", () => {
  it("keeps a portaled mobile list opaque and inside its anchor width", () => {
    document.documentElement.dataset.frontend = "browser-mobile";
    document.documentElement.style.setProperty("--b3-theme-background", "rgb(21, 19, 32)");
    document.documentElement.style.setProperty("--b3-theme-on-background", "rgb(224, 222, 244)");
    document.body.innerHTML = `
      <div class="damophus-select-content z-[10000]" style="--bits-select-anchor-width: 300px; width: 300px">
        <div data-select-viewport>
          <div data-slot="select-group" style="padding: 4px">
            <div data-slot="select-item" style="padding: 4px 32px 4px 6px; width: 100%">整个文档</div>
          </div>
        </div>
      </div>
    `;

    const content = document.querySelector<HTMLElement>(".damophus-select-content")!;
    const item = content.querySelector<HTMLElement>('[data-slot="select-item"]')!;
    expect(getComputedStyle(content).backgroundColor).toBe("rgb(21, 19, 32)");
    expect(getComputedStyle(content).boxSizing).toBe("border-box");
    expect(getComputedStyle(content).zIndex).toBe("10000");
    expect(getComputedStyle(item).boxSizing).toBe("border-box");
    expect(item.getBoundingClientRect().right).toBeLessThanOrEqual(content.getBoundingClientRect().right);
  });

  it("stays opaque when a portal cannot inherit the component theme variables", () => {
    document.documentElement.style.removeProperty("--b3-theme-background");
    document.documentElement.style.removeProperty("--b3-theme-on-background");
    document.body.innerHTML = `
      <div class="damophus-select-content" style="--bits-select-anchor-width: 280px">
        <div data-slot="select-viewport">
          <div data-slot="select-item">整个文档</div>
        </div>
      </div>
    `;

    const content = document.querySelector<HTMLElement>(".damophus-select-content")!;
    const item = content.querySelector<HTMLElement>('[data-slot="select-item"]')!;
    expect(getComputedStyle(content).backgroundColor).toBe("rgb(255, 255, 255)");
    expect(getComputedStyle(content).borderTopWidth).toBe("1px");
    expect(getComputedStyle(item).backgroundColor).toBe("rgb(255, 255, 255)");
  });

  it("keeps portaled scrolling away from SiYuan's document gesture handlers", () => {
    const content = document.createElement("div");
    const item = document.createElement("div");
    content.append(item);
    document.body.append(content);
    const contentMoveHandler = vi.fn();
    const contentEndHandler = vi.fn();
    const documentMoveHandler = vi.fn();
    const documentEndHandler = vi.fn();
    content.addEventListener("touchmove", contentMoveHandler);
    content.addEventListener("touchend", contentEndHandler);
    document.addEventListener("touchmove", documentMoveHandler);
    document.addEventListener("touchend", documentEndHandler);
    const isolation = isolatePortaledSelectGestures(content);

    item.dispatchEvent(new Event("touchmove", { bubbles: true }));
    item.dispatchEvent(new Event("touchend", { bubbles: true }));

    expect(contentMoveHandler).toHaveBeenCalledOnce();
    expect(contentEndHandler).toHaveBeenCalledOnce();
    expect(documentMoveHandler).not.toHaveBeenCalled();
    expect(documentEndHandler).not.toHaveBeenCalled();
    isolation.destroy();
    document.removeEventListener("touchmove", documentMoveHandler);
    document.removeEventListener("touchend", documentEndHandler);
  });
});
