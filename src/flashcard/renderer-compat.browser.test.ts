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

  it("hides topic relations until the answer is shown", async () => {
    const card = document.createElement("div");
    card.className = "card__block";
    const root = document.createElement("div");
    root.dataset.nodeId = "20260823130238-card003";
    root.setAttribute("custom-dm-card-renderer", "list");
    const relations = document.createElement("div");
    relations.className = "damophus-topic-relations";
    relations.textContent = "考点关系";
    root.append(relations);
    card.append(root);
    const actions = document.createElement("div");
    actions.innerHTML = '<div class="card__action"></div><div class="card__action fn__none"></div>';
    document.body.append(card, actions);

    const compat = new FlashcardRendererCompat();
    compat.preload(root.dataset.nodeId, "list");
    compat.install();
    compat.setVisibility({ mark: true, list: true, heading: true, superBlock: true, blockquote: true, callout: true, tag: false, topicRelations: true });
    await vi.waitFor(() => expect(card.classList.contains("damophus-card--hidetopicrelations")).toBe(true));
    expect(getComputedStyle(relations).display).toBe("none");

    actions.lastElementChild?.classList.remove("fn__none");
    compat.refresh();
    await vi.waitFor(() => expect(card.classList.contains("damophus-card--hidetopicrelations")).toBe(false));
    expect(getComputedStyle(relations).display).not.toBe("none");
    compat.uninstall();
  });

  it("uses the preloaded renderer when materialization strips the renderer IAL", async () => {
    const card = document.createElement("div");
    card.className = "card__block";
    const root = document.createElement("div");
    root.dataset.nodeId = "20260823130238-card004";
    const calloutContent = document.createElement("div");
    calloutContent.className = "callout-content";
    calloutContent.textContent = "答案";
    root.append(calloutContent);
    card.append(root);
    const actions = document.createElement("div");
    actions.innerHTML = '<div class="card__action"></div><div class="card__action fn__none"></div>';
    document.body.append(card, actions);

    const compat = new FlashcardRendererCompat();
    compat.preload(root.dataset.nodeId, "callout");
    compat.install();
    await vi.waitFor(() => expect(card.classList.contains("damophus-card--hidecallout")).toBe(true));
    expect(card.classList.contains("card__block--hidemark")).toBe(false);
    expect(card.classList.contains("card__block--hideli")).toBe(false);
    expect(getComputedStyle(calloutContent).display).toBe("none");

    actions.lastElementChild?.classList.remove("fn__none");
    compat.refresh();
    await vi.waitFor(() => expect(card.classList.contains("damophus-card--hidecallout")).toBe(false));
    expect(getComputedStyle(calloutContent).display).not.toBe("none");
    compat.uninstall();
  });

  it("resolves a card block that is itself the materialized root", async () => {
    const card = document.createElement("div");
    card.className = "card__block";
    card.dataset.nodeId = "20260823130238-card005";
    document.body.append(card);

    const compat = new FlashcardRendererCompat();
    compat.preload(card.dataset.nodeId, "list");
    compat.install();
    await vi.waitFor(() => expect(card.classList.contains("card__block--hideli")).toBe(true));
    expect(card.classList.contains("card__block--hidemark")).toBe(false);
    expect(card.classList.contains("card__block--hideh")).toBe(false);
    compat.uninstall();
  });

  it("keeps native highlight hiding for a list card that contains a mark", async () => {
    const card = document.createElement("div");
    card.className = "card__block";
    const root = document.createElement("div");
    root.dataset.nodeId = "20260823130238-card007";
    root.setAttribute("custom-dm-card-renderer", "list");
    const list = document.createElement("div");
    list.className = "list";
    list.setAttribute("custom-riff-decks", "deck");
    const mark = document.createElement("span");
    mark.dataset.type = "mark";
    mark.textContent = "挖空";
    list.append(mark);
    root.append(list);
    card.append(root);
    document.body.append(card);

    const compat = new FlashcardRendererCompat();
    compat.preload(root.dataset.nodeId, "list");
    compat.install();
    await vi.waitFor(() => expect(card.classList.contains("card__block--hideli")).toBe(true));
    expect(card.classList.contains("card__block--hidemark")).toBe(true);
    compat.uninstall();
  });

  it("stops overriding native rendering after a card is unregistered", async () => {
    const card = document.createElement("div");
    card.className = "card__block";
    const root = document.createElement("div");
    root.dataset.nodeId = "20260823130238-card008";
    root.setAttribute("custom-dm-card-renderer", "list");
    const list = document.createElement("div");
    list.className = "list";
    root.append(list);
    card.append(root);
    document.body.append(card);

    const compat = new FlashcardRendererCompat();
    compat.preload(root.dataset.nodeId, "list");
    compat.install();
    await vi.waitFor(() => expect(card.classList.contains("card__block--hideli")).toBe(true));

    compat.forget([root.dataset.nodeId]);
    expect(card.classList.contains("card__block--hideli")).toBe(false);
    root.setAttribute("data-render-cycle", "native");
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(card.classList.contains("card__block--hideli")).toBe(false);

    compat.preload(root.dataset.nodeId, "list");
    await vi.waitFor(() => expect(card.classList.contains("card__block--hideli")).toBe(true));
    compat.uninstall();
  });

  it("forces the first renderer card back to its question state", async () => {
    const card = document.createElement("div");
    card.className = "card__block";
    const root = document.createElement("div");
    root.dataset.nodeId = "20260823130238-card006";
    root.setAttribute("custom-dm-card-renderer", "list");
    card.append(root);
    const actions = document.createElement("div");
    actions.innerHTML = '<div class="card__action fn__none"></div><div class="card__action"></div>';
    document.body.append(card, actions);

    const compat = new FlashcardRendererCompat();
    compat.preload(root.dataset.nodeId, "list");
    compat.install();
    await vi.waitFor(() => expect(card.classList.contains("card__block--hideli")).toBe(true));
    expect(actions.firstElementChild?.classList.contains("fn__none")).toBe(false);
    expect(actions.lastElementChild?.classList.contains("fn__none")).toBe(true);

    actions.firstElementChild?.classList.add("fn__none");
    actions.lastElementChild?.classList.remove("fn__none");
    compat.refresh();
    await vi.waitFor(() => expect(card.classList.contains("card__block--hideli")).toBe(false));
    compat.uninstall();
  });
});
