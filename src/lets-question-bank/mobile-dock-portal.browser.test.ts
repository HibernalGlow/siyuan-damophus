import { afterEach, describe, expect, it, vi } from "vitest";
import { PersistentMobileDockPortal } from "./mobile-dock-portal";

type TestApp = { host: HTMLElement };

function createPortal(cleanup = vi.fn()) {
  const portal = new PersistentMobileDockPortal<TestApp>({
    mount(host) {
      host.innerHTML = `
        <article data-question>Question 12</article>
        <section data-answer>Existing answer</section>
        <input data-note value="Unsent note">
        <select data-rating>
          <option value="again">Again</option>
          <option value="good">Good</option>
        </select>
        <div data-scroll style="height: 40px; overflow: auto">
          <div style="height: 240px">Scrollable answer</div>
        </div>
      `;
      return { host };
    },
    unmount: cleanup,
  });
  return { portal, cleanup };
}

afterEach(() => document.body.replaceChildren());

describe("PersistentMobileDockPortal", () => {
  it("keeps the same question-bank DOM and live state across Dock switches", () => {
    const { portal, cleanup } = createPortal();
    const firstDock = document.createElement("aside");
    const secondDock = document.createElement("aside");
    document.body.append(firstDock, secondDock);

    const host = portal.attach(firstDock);
    const note = host.querySelector<HTMLInputElement>("[data-note]")!;
    const rating = host.querySelector<HTMLSelectElement>("[data-rating]")!;
    const scroll = host.querySelector<HTMLElement>("[data-scroll]")!;
    note.value = "Edited while practicing";
    rating.value = "good";
    scroll.scrollTop = 72;

    portal.detach(firstDock);
    expect(firstDock.childElementCount).toBe(0);
    expect(cleanup).not.toHaveBeenCalled();

    const restoredHost = portal.attach(secondDock);
    expect(restoredHost).toBe(host);
    expect(secondDock.firstElementChild).toBe(host);
    expect(host.querySelector("[data-question]")?.textContent).toBe("Question 12");
    expect(host.querySelector("[data-answer]")?.textContent).toBe("Existing answer");
    expect(note.value).toBe("Edited while practicing");
    expect(rating.value).toBe("good");
    expect(scroll.scrollTop).toBe(72);
    expect(cleanup).not.toHaveBeenCalled();

    portal.detach(secondDock);
    portal.dispose();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledWith({ host });
  });

  it("ignores a stale destroy callback after a newer Dock attachment", () => {
    const { portal } = createPortal();
    const oldDock = document.createElement("aside");
    const currentDock = document.createElement("aside");
    document.body.append(oldDock, currentDock);

    const host = portal.attach(oldDock);
    portal.attach(currentDock);
    portal.detach(oldDock);

    expect(currentDock.firstElementChild).toBe(host);
    portal.dispose();
  });

  it("cleans up exactly once even when plugin teardown repeats", () => {
    const { portal, cleanup } = createPortal();
    const dock = document.createElement("aside");
    document.body.append(dock);
    portal.attach(dock);

    portal.dispose();
    portal.dispose();

    expect(cleanup).toHaveBeenCalledOnce();
  });
});
