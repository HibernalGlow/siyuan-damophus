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
  image.setAttribute("data-damophus-animated-type", "avif");
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
    player = startAnimatedImageReplay({
      replayLabel: "Replay image",
      replayOnHover: false,
      scanDocument: false,
    });

    await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
    expect(document.querySelector(".damophus-animated-image-overlay")).toBeNull();

    player.scanRoot(document.body);
    await vi.waitFor(() => {
      expect(document.querySelector(".damophus-animated-image-overlay")).not.toBeNull();
    });

    player.disposeRoot(document.body);
    expect(document.querySelector(".damophus-animated-image-overlay")).toBeNull();
  });

  it("freezes the initial frame and keeps a replay control above it", async () => {
    await mountImage();
    player = startAnimatedImageReplay({
      replayLabel: "Replay image",
      replayOnHover: false,
    });

    await vi.waitFor(() => {
      const overlay = document.querySelector(".damophus-animated-image-overlay");
      expect(overlay).not.toBeNull();
      expect(overlay?.querySelector("canvas:not([hidden])")).not.toBeNull();
      expect(overlay?.querySelector('button[aria-label="Replay image"]')).not.toBeNull();
    });
  });

  it("reuses the downloaded media when the replay control is clicked again", async () => {
    const image = await mountImage();
    player = startAnimatedImageReplay({
      replayLabel: "Replay image",
      replayOnHover: false,
    });
    const fetchSpy = vi.spyOn(window, "fetch");

    await vi.waitFor(() => {
      expect(document.querySelector('button[aria-label="Replay image"]')).not.toBeNull();
    });
    await userEvent.click(document.querySelector<HTMLButtonElement>('button[aria-label="Replay image"]')!);
    await vi.waitFor(() => expect(image.getAttribute("src")).toMatch(/^blob:/));
    const firstReplaySource = image.getAttribute("src");
    await userEvent.click(document.querySelector<HTMLButtonElement>('button[aria-label="Replay image"]')!);
    await vi.waitFor(() => expect(image.getAttribute("src")).not.toBe(firstReplaySource));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("removes controls and restores the original image when disposed", async () => {
    const image = await mountImage();
    player = startAnimatedImageReplay({
      replayLabel: "Replay image",
      replayOnHover: false,
    });

    await vi.waitFor(() => {
      expect(document.querySelector('button[aria-label="Replay image"]')).not.toBeNull();
    });
    await userEvent.click(document.querySelector<HTMLButtonElement>('button[aria-label="Replay image"]')!);
    await vi.waitFor(() => expect(image.getAttribute("src")).toMatch(/^blob:/));

    player.dispose();
    player = undefined;

    expect(image.getAttribute("src")).toBe(testImage);
    expect(document.querySelector(".damophus-animated-image-overlay")).toBeNull();
    expect(document.getElementById("damophus-animated-image-replay-styles")).toBeNull();
  });
});
