import { afterEach, describe, expect, it, vi } from "vitest";
import { FlashcardRendererCompat } from "./renderer-compat";

describe("flashcard renderer compatibility", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("intercepts a writable flashcard data property and restores it exactly", async () => {
    const original = { mark: true, list: true, heading: false, superBlock: false };
    const config = { flashcard: original };
    const descriptor = Object.getOwnPropertyDescriptor(config, "flashcard");
    const host = { siyuan: { config }, fetch: vi.fn(async () => new Response("{}")) };
    vi.stubGlobal("window", host);
    const originalFetch = window.fetch;

    const compat = new FlashcardRendererCompat();
    compat.preload("20260823000000-aaaaaaa", "heading");
    expect(compat.install().installed).toBe(true);
    await window.fetch("/api/block/getDocInfo", { body: JSON.stringify({ id: "20260823000000-aaaaaaa" }) });
    expect(config.flashcard).toMatchObject({ mark: false, list: false, heading: true, superBlock: false });
    expect(config.flashcard).toEqual(original);
    compat.uninstall();
    expect(Object.getOwnPropertyDescriptor(config, "flashcard")).toEqual(descriptor);
    expect(window.fetch).toBe(originalFetch);
  });

  it("isolates a DAMO renderer read from ordinary cards using global settings", async () => {
    const original = { mark: true, list: false, heading: false, superBlock: false };
    const config = { flashcard: original };
    const host = { siyuan: { config }, fetch: vi.fn(async () => new Response("{}")) };
    vi.stubGlobal("window", host);
    const compat = new FlashcardRendererCompat();
    compat.preload("20260823000000-bbbbbbb", "list");
    expect(compat.install().installed).toBe(true);
    await window.fetch("/api/block/getDocInfo", { body: JSON.stringify({ id: "20260823000000-bbbbbbb" }) });
    expect(config.flashcard).toMatchObject({ mark: false, list: true });
    expect(config.flashcard).toEqual(original);
    // A normal/legacy card has no pending DAMO renderer and keeps the user's
    // global mark-only configuration on its next read.
    expect(config.flashcard).toEqual(original);
    compat.uninstall();
  });
});
