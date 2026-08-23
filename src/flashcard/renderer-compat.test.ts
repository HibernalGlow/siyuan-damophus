import { afterEach, describe, expect, it, vi } from "vitest";
import { FlashcardRendererCompat } from "./renderer-compat";

describe("flashcard renderer compatibility", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("installs without replacing the global flashcard configuration", async () => {
    const original = { mark: true, list: true, heading: false, superBlock: false };
    const config = { flashcard: original };
    const host = { siyuan: { config }, fetch: vi.fn(async () => new Response("{}")) };
    vi.stubGlobal("window", host);
    const originalFetch = window.fetch;

    const compat = new FlashcardRendererCompat();
    compat.preload("20260823000000-aaaaaaa", "heading");
    expect(compat.install().installed).toBe(true);
    await window.fetch("/api/block/getDocInfo", { body: JSON.stringify({ id: "20260823000000-aaaaaaa" }) });
    expect(config.flashcard).toEqual(original);
    await window.fetch("/api/block/getDocInfo", { body: JSON.stringify({ id: "20260823000000-legacy" }) });
    expect(config.flashcard).toEqual(original);
    compat.uninstall();
    expect(config.flashcard).toEqual(original);
    expect(window.fetch).toBe(originalFetch);
  });

  it("keeps ordinary cards on the user's global configuration", async () => {
    const original = { mark: true, list: false, heading: false, superBlock: false };
    const config = { flashcard: original };
    const host = { siyuan: { config }, fetch: vi.fn(async () => new Response("{}")) };
    vi.stubGlobal("window", host);
    const compat = new FlashcardRendererCompat();
    compat.preload("20260823000000-bbbbbbb", "list");
    expect(compat.install().installed).toBe(true);
    await window.fetch("/api/block/getDocInfo", { body: JSON.stringify({ id: "20260823000000-bbbbbbb" }) });
    // A normal/legacy card has no pending DAMO renderer and keeps the user's
    // global mark-only configuration on its next read.
    await window.fetch("/api/block/getDocInfo", { body: JSON.stringify({ id: "20260823000000-legacy" }) });
    expect(config.flashcard).toEqual(original);
    compat.uninstall();
  });
});
