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

const mountImage = async (animatedSource?: string): Promise<HTMLImageElement> => {
  const image = document.createElement("img");
  image.setAttribute("data-damophus-animated-type", "avif");
  if (animatedSource) image.dataset.damophusAnimatedSrc = animatedSource;
  image.alt = "Animated test image";
  image.src = testImage;
  image.style.cssText = "display:block;width:320px;height:180px";
  document.body.append(image);
  await image.decode();
  return image;
};

const mountManifestImage = async (): Promise<HTMLImageElement> => {
  return mountImage("https://inkloomer.github.io/inkloom/animation-avif/test/scene.avif");
};

afterEach(() => {
  player?.dispose();
  player = undefined;
  document.body.replaceChildren();
  document.getElementById("damophus-animated-image-replay-styles")?.remove();
  (window as typeof window & {__damophusAnimatedStillFrames?: Map<string, HTMLCanvasElement>})
    .__damophusAnimatedStillFrames?.clear();
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

  it("cancels queued scans when the plugin player is disposed", async () => {
    await mountImage();
    player = startAnimatedImageReplay({
      replayLabel: "Replay image",
      replayOnHover: false,
      scanDocument: false,
    });
    player.scanRoot(document.body);
    player.dispose();
    player = undefined;

    await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
    expect(document.querySelector(".damophus-animated-image-overlay")).toBeNull();
  });

  it("freezes the initial frame and keeps a replay control above it", async () => {
    const image = await mountImage();
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
    expect(image.style.opacity).toBe("0");
  });

  it("keeps hover replay active while the original image is visually hidden", async () => {
    const image = await mountImage();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    player = startAnimatedImageReplay({
      replayLabel: "Replay image",
      replayOnHover: true,
      hoverReplayDelayMs: 100,
    });
    await vi.waitFor(() => {
      expect(document.querySelector("canvas:not([hidden])")).not.toBeNull();
    });

    image.dispatchEvent(new PointerEvent("pointerenter", {pointerType: "mouse"}));
    await vi.waitFor(() => expect(
      document.querySelector<HTMLImageElement>(".damophus-animated-image-overlay__replay")?.src,
    ).toMatch(/^blob:/));
  });

  it("does not capture the first frame before the tail-mode duration elapses", async () => {
    await mountManifestImage();
    vi.spyOn(window, "fetch").mockResolvedValue(new Response(JSON.stringify({
      scenes: [{file: "scene.avif", durationMs: 1000}],
    }), {
      headers: {"content-type": "application/json"},
    }));
    player = startAnimatedImageReplay({
      replayLabel: "Replay image",
      replayOnHover: false,
      playbackEndGuardMs: 0,
    });

    await vi.waitFor(() => {
      expect(document.querySelector(".damophus-animated-image-overlay")).not.toBeNull();
    });
    expect(document.querySelector("canvas:not([hidden])")).toBeNull();

    await new Promise<void>((resolve) => window.setTimeout(resolve, 1050));
    await vi.waitFor(() => {
      expect(document.querySelector("canvas:not([hidden])")).not.toBeNull();
    });
  });

  it("restores the remembered tail frame when SiYuan replaces an image node", async () => {
    const source = "https://inkloomer.github.io/inkloom/animation-avif/test/scene.avif";
    const first = await mountImage(source);
    vi.spyOn(window, "fetch").mockResolvedValue(new Response(JSON.stringify({
      targetFps: 30,
      scenes: [{file: "scene.avif", durationMs: 300, frameCount: 9}],
    }), {
      headers: {"content-type": "application/json"},
    }));
    player = startAnimatedImageReplay({
      replayLabel: "Replay image",
      replayOnHover: false,
    });

    await vi.waitFor(() => {
      expect(document.querySelector("canvas:not([hidden])")).not.toBeNull();
    });
    first.remove();
    await mountImage(source);

    await vi.waitFor(() => {
      expect(document.querySelectorAll(".damophus-animated-image-overlay")).toHaveLength(1);
    });
    expect(document.querySelector("canvas:not([hidden])")).not.toBeNull();
  });

  it("restores the remembered tail frame after the plugin player restarts", async () => {
    await mountManifestImage();
    vi.spyOn(window, "fetch").mockResolvedValue(new Response(JSON.stringify({
      targetFps: 30,
      scenes: [{file: "scene.avif", durationMs: 300, frameCount: 9}],
    }), {
      headers: {"content-type": "application/json"},
    }));
    player = startAnimatedImageReplay({replayOnHover: false});
    await vi.waitFor(() => {
      expect(document.querySelector("canvas:not([hidden])")).not.toBeNull();
    });

    player.dispose();
    player = startAnimatedImageReplay({replayOnHover: false});
    await vi.waitFor(() => {
      expect(document.querySelector(".damophus-animated-image-overlay")).not.toBeNull();
    });
    expect(document.querySelector("canvas:not([hidden])")).not.toBeNull();
  });

  it("attaches the remembered tail while a virtualized replacement has zero size", async () => {
    const source = "https://inkloomer.github.io/inkloom/animation-avif/test/scene.avif";
    const first = await mountImage(source);
    vi.spyOn(window, "fetch").mockResolvedValue(new Response(JSON.stringify({
      targetFps: 30,
      scenes: [{file: "scene.avif", durationMs: 120, frameCount: 4}],
    }), {
      headers: {"content-type": "application/json"},
    }));
    player = startAnimatedImageReplay({replayOnHover: false});
    await vi.waitFor(() => {
      expect(document.querySelector("canvas:not([hidden])")).not.toBeNull();
    });
    first.remove();

    const replacement = document.createElement("img");
    replacement.dataset.damophusAnimatedType = "avif";
    replacement.dataset.damophusAnimatedSrc = source;
    replacement.src = testImage;
    replacement.style.cssText = "display:none;width:320px;height:180px";
    document.body.append(replacement);
    await replacement.decode();
    await vi.waitFor(() => {
      expect(replacement.dataset.damophusAnimatedImageReplay).toBe("ready");
      expect(document.querySelectorAll(".damophus-animated-image-overlay")).toHaveLength(1);
    });
    expect(document.querySelector("canvas")).not.toBeNull();
    expect(replacement.style.opacity).toBe("0");

    replacement.style.display = "block";
    await vi.waitFor(() => {
      expect(document.querySelector<HTMLElement>(".damophus-animated-image-overlay")?.hidden).toBe(false);
      expect(document.querySelector("canvas:not([hidden])")).not.toBeNull();
    });
    expect(replacement.style.opacity).toBe("0");
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
    await vi.waitFor(() => expect(
      document.querySelector<HTMLImageElement>(".damophus-animated-image-overlay__replay")?.src,
    ).toMatch(/^blob:/));
    const replayImage = document.querySelector<HTMLImageElement>(".damophus-animated-image-overlay__replay")!;
    const firstReplaySource = replayImage.src;
    await userEvent.click(document.querySelector<HTMLButtonElement>('button[aria-label="Replay image"]')!);
    await vi.waitFor(() => expect(replayImage.src).not.toBe(firstReplaySource));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(image.getAttribute("src")).toBe(testImage);
  });

  it("freezes the previous replay layer without resetting either original image", async () => {
    const first = await mountImage();
    const second = await mountImage();
    player = startAnimatedImageReplay({
      replayLabel: "Replay image",
      replayOnHover: false,
      playbackEndGuardMs: 0,
    });

    await vi.waitFor(() => {
      expect(document.querySelectorAll('button[aria-label="Replay image"]')).toHaveLength(2);
    });
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="Replay image"]')];
    await userEvent.click(buttons[0]);
    await vi.waitFor(() => {
      expect(document.querySelectorAll<HTMLImageElement>(".damophus-animated-image-overlay__replay[src^='blob:']")).toHaveLength(1);
    });
    await userEvent.click(buttons[1]);
    await vi.waitFor(() => {
      expect(document.querySelectorAll<HTMLImageElement>(".damophus-animated-image-overlay__replay[src^='blob:']")).toHaveLength(2);
      expect(document.querySelectorAll<HTMLCanvasElement>(".damophus-animated-image-overlay__still:not([hidden])")).toHaveLength(1);
    });

    expect(first.getAttribute("src")).toBe(testImage);
    expect(second.getAttribute("src")).toBe(testImage);
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
    await vi.waitFor(() => expect(
      document.querySelector<HTMLImageElement>(".damophus-animated-image-overlay__replay")?.src,
    ).toMatch(/^blob:/));

    player.dispose();
    player = undefined;

    expect(image.getAttribute("src")).toBe(testImage);
    expect(image.style.opacity).toBe("");
    expect(document.querySelector(".damophus-animated-image-overlay")).toBeNull();
    expect(document.getElementById("damophus-animated-image-replay-styles")).toBeNull();
  });
});
