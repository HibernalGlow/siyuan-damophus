import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  startAnimatedImageReplay,
  type AnimatedImageReplayHandle,
} from "./animated-image-replay";

const testImage =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#245b4a"/></svg>',
  );

let player: AnimatedImageReplayHandle | undefined;

const mountImage = async (): Promise<HTMLImageElement> => {
  const image = document.createElement("img");
  image.dataset.damophusAnimatedType = "avif";
  image.alt = "Animated test image";
  image.src = testImage;
  image.style.cssText = "display:block;width:320px;height:180px";
  document.body.append(image);
  await image.decode();
  return image;
};

afterEach(() => {
  player?.dispose();
  player = undefined;
  document.body.replaceChildren();
  document.getElementById("damophus-animated-image-replay-styles")?.remove();
  vi.restoreAllMocks();
});

describe("animated image replay", () => {
  it("only scans roots supplied by the host when document scanning is disabled", async () => {
    await mountImage();
    player = startAnimatedImageReplay({replayOnHover: false, scanDocument: false});

    await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
    expect(document.querySelector(".damophus-animated-image-overlay")).toBeNull();

    player.scanRoot(document.body);
    await vi.waitFor(() => {
      expect(document.querySelector(".damophus-animated-image-overlay")).not.toBeNull();
    });
  });

  it("cancels queued scans when disposed", async () => {
    await mountImage();
    player = startAnimatedImageReplay({replayOnHover: false, scanDocument: false});
    player.scanRoot(document.body);
    player.dispose();
    player = undefined;

    await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
    expect(document.querySelector(".damophus-animated-image-overlay")).toBeNull();
  });

  it("never changes or covers the native image before replay", async () => {
    const image = await mountImage();
    player = startAnimatedImageReplay({replayOnHover: false});

    await vi.waitFor(() => {
      expect(document.querySelector(".damophus-animated-image-overlay")).not.toBeNull();
    });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 150));

    expect(image.getAttribute("src")).toBe(testImage);
    expect(image.style.opacity).toBe("");
    expect(image.style.visibility).toBe("");
    expect(document.querySelector("canvas")).toBeNull();
    expect(document.querySelector(".damophus-animated-image-overlay__replay")).toBeNull();
  });

  it("replays on hover without mutating the native image", async () => {
    const image = await mountImage();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    player = startAnimatedImageReplay({replayOnHover: true, hoverReplayDelayMs: 100});
    await vi.waitFor(() => {
      expect(document.querySelector(".damophus-animated-image-overlay")).not.toBeNull();
    });

    image.dispatchEvent(new PointerEvent("pointerenter", {pointerType: "mouse"}));
    await vi.waitFor(() => expect(
      document.querySelector<HTMLImageElement>(".damophus-animated-image-overlay__replay")?.src,
    ).toMatch(/^blob:/));
    expect(image.getAttribute("src")).toBe(testImage);
  });

  it("reuses the downloaded media on repeated replay", async () => {
    const image = await mountImage();
    player = startAnimatedImageReplay({replayOnHover: false});
    const fetchSpy = vi.spyOn(window, "fetch");
    await vi.waitFor(() => {
      expect(document.querySelector('button[aria-label="Replay image"]')).not.toBeNull();
    });

    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Replay image"]')!;
    await userEvent.click(button);
    await vi.waitFor(() => expect(
      document.querySelector<HTMLImageElement>(".damophus-animated-image-overlay__replay")?.src,
    ).toMatch(/^blob:/));
    const firstReplay = document.querySelector<HTMLImageElement>(".damophus-animated-image-overlay__replay")!;

    await userEvent.click(button);
    await vi.waitFor(() => {
      const currentReplay = document.querySelector<HTMLImageElement>(".damophus-animated-image-overlay__replay");
      expect(currentReplay).not.toBe(firstReplay);
      expect(currentReplay?.src).toMatch(/^blob:/);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(image.getAttribute("src")).toBe(testImage);
  });

  it("keeps every image independent when another image replays", async () => {
    const first = await mountImage();
    const second = await mountImage();
    player = startAnimatedImageReplay({replayOnHover: false});
    await vi.waitFor(() => {
      expect(document.querySelectorAll('button[aria-label="Replay image"]')).toHaveLength(2);
    });
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="Replay image"]')];

    await userEvent.click(buttons[0]);
    await vi.waitFor(() => {
      expect(document.querySelectorAll(".damophus-animated-image-overlay__replay")).toHaveLength(1);
    });
    const firstReplay = document.querySelector<HTMLImageElement>(".damophus-animated-image-overlay__replay")!;
    await userEvent.click(buttons[1]);
    await vi.waitFor(() => {
      expect(document.querySelectorAll(".damophus-animated-image-overlay__replay")).toHaveLength(2);
    });

    expect(firstReplay.isConnected).toBe(true);
    expect(first.getAttribute("src")).toBe(testImage);
    expect(second.getAttribute("src")).toBe(testImage);
  });

  it("lets a virtualized replacement load and finish naturally", async () => {
    const first = await mountImage();
    player = startAnimatedImageReplay({replayOnHover: false});
    await vi.waitFor(() => {
      expect(document.querySelector(".damophus-animated-image-overlay")).not.toBeNull();
    });
    first.remove();

    const replacement = document.createElement("img");
    replacement.dataset.damophusAnimatedType = "avif";
    replacement.src = testImage;
    replacement.style.cssText = "display:none;width:320px;height:180px";
    document.body.append(replacement);
    await replacement.decode();
    await vi.waitFor(() => {
      expect(replacement.dataset.damophusAnimatedImageReplay).toBe("ready");
    });

    replacement.style.display = "block";
    await vi.waitFor(() => {
      expect(document.querySelector<HTMLElement>(".damophus-animated-image-overlay")?.hidden).toBe(false);
    });
    expect(replacement.getAttribute("src")).toBe(testImage);
    expect(replacement.style.opacity).toBe("");
    expect(replacement.style.visibility).toBe("");
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("rebinds the same native image node after viewport detachment", async () => {
    const image = await mountImage();
    player = startAnimatedImageReplay({replayOnHover: false});
    await vi.waitFor(() => {
      expect(document.querySelector(".damophus-animated-image-overlay")).not.toBeNull();
    });

    image.remove();
    document.body.append(image);
    await vi.waitFor(() => {
      expect(document.querySelectorAll(".damophus-animated-image-overlay")).toHaveLength(1);
      expect(image.dataset.damophusAnimatedImageReplay).toBe("ready");
    });
    expect(image.getAttribute("src")).toBe(testImage);
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("removes replay layers without touching the native image when disposed", async () => {
    const image = await mountImage();
    player = startAnimatedImageReplay({replayOnHover: false});
    await vi.waitFor(() => {
      expect(document.querySelector('button[aria-label="Replay image"]')).not.toBeNull();
    });
    await userEvent.click(document.querySelector<HTMLButtonElement>('button[aria-label="Replay image"]')!);
    await vi.waitFor(() => {
      expect(document.querySelector(".damophus-animated-image-overlay__replay")).not.toBeNull();
    });

    player.dispose();
    player = undefined;

    expect(image.getAttribute("src")).toBe(testImage);
    expect(image.style.opacity).toBe("");
    expect(image.style.visibility).toBe("");
    expect(document.querySelector(".damophus-animated-image-overlay")).toBeNull();
    expect(document.getElementById("damophus-animated-image-replay-styles")).toBeNull();
  });
});
