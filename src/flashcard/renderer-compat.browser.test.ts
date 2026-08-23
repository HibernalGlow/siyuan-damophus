import { afterEach, describe, expect, it, vi } from "vitest";
import { FlashcardRendererCompat } from "./renderer-compat";

describe("flashcard renderer compatibility browser guard", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("does not recurse when the card-render callback refreshes the compat layer", async () => {
    const card = document.createElement("div");
    card.className = "card__block";
    const root = document.createElement("div");
    root.dataset.nodeId = "20260823130238-card001";
    root.setAttribute("custom-dm-card-renderer", "list");
    card.append(root);
    document.body.append(card);

    const compat = new FlashcardRendererCompat();
    compat.preload(root.dataset.nodeId, "list");
    const onCardRender = vi.fn(() => compat.refresh());
    compat.onCardRender = onCardRender;
    expect(compat.install().installed).toBe(true);

    expect(() => compat.refresh()).not.toThrow();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(onCardRender).toHaveBeenCalledOnce();

    compat.uninstall();
  });

  it("applies renderer visibility without generating repeated class mutations", async () => {
    const card = document.createElement("div");
    card.className = "card__block";
    const root = document.createElement("div");
    root.dataset.nodeId = "20260823130238-card002";
    root.setAttribute("custom-dm-card-renderer", "blockquote");
    card.append(root);
    document.body.append(card);

    const compat = new FlashcardRendererCompat();
    compat.preload(root.dataset.nodeId, "blockquote");
    compat.install();
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(card, { attributes: true, attributeFilter: ["class"] });
    compat.refresh();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    const firstCount = mutations.length;
    compat.refresh();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(mutations.length).toBe(firstCount);
    observer.disconnect();
    compat.uninstall();
  });
});
