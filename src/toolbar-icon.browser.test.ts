import { describe, expect, it } from "vitest";
import damophusMonoIcon from "../damophus-icon-mono.svg?raw";
import { prepareToolbarIcon } from "./toolbar-icon";

describe("toolbar icon", () => {
  it("does not leak SVG title or formatting whitespace into SiYuan plugin menus", () => {
    const host = document.createElement("div");
    host.innerHTML = prepareToolbarIcon(damophusMonoIcon);
    const svg = host.querySelector("svg")!;

    expect(svg.textContent).toBe("");
    expect(svg.querySelector("title")).toBeNull();
    expect(svg.getAttribute("aria-hidden")).toBe("true");

    const copiedMenuLabel = `${svg.textContent ?? ""}Damophus`;
    expect(copiedMenuLabel).toBe("Damophus");
  });
});
