import { afterEach, describe, expect, it } from "vitest";
import "@/styles/damophus.css";

afterEach(() => document.body.replaceChildren());

describe("native flashcard floating outline isolation", () => {
  it("hides the floating outline inside flashcard review surfaces only", () => {
    document.body.innerHTML = `
      <div class="card__main">
        <div class="siyuan-floating-toc-plugin-container"></div>
      </div>
      <div class="protyle">
        <div class="siyuan-floating-toc-plugin-container" data-testid="document-outline"></div>
      </div>
    `;

    const outlines = document.querySelectorAll<HTMLElement>(".siyuan-floating-toc-plugin-container");
    expect(getComputedStyle(outlines[0]).display).toBe("none");
    expect(getComputedStyle(outlines[1]).display).not.toBe("none");
  });
});
