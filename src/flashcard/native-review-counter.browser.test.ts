import { afterEach, describe, expect, it } from "vitest";
import { NativeReviewCounter } from "./native-review-counter";

let counter: NativeReviewCounter | undefined;

afterEach(() => {
  counter?.uninstall();
  counter = undefined;
  document.body.innerHTML = "";
});

function mountCounter(): HTMLElement {
  const root = document.createElement("div");
  root.className = "card__main";
  root.innerHTML = '<div data-type="count" class="ft__flex"></div>';
  document.body.append(root);
  return root.querySelector<HTMLElement>('[data-type="count"]')!;
}

describe("native review priority counter", () => {
  it("renders priority quantities and preserves native markup on unload", async () => {
    const count = mountCounter();
    count.innerHTML = "native counter";
    counter = new NativeReviewCounter({ documentRef: document });
    counter.setQueue([
      { cardID: "p1-a", priority: "P1" },
      { cardID: "p1-b", priority: "P1" },
      { cardID: "p2-a", priority: "P2" },
      { cardID: "other-a", priority: "other" },
    ]);
    counter.install();

    expect(count.querySelector('[data-priority="P1"] strong')?.textContent).toBe("2");
    expect(count.querySelector('[data-priority="P2"] strong')?.textContent).toBe("1");
    expect(count.querySelector('[data-priority="P3"] strong')?.textContent).toBe("0");
    expect(count.textContent).toContain("共 4");

    counter.markReviewed("p1-a", "3");
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(count.querySelector('[data-priority="P1"] strong')?.textContent).toBe("1");

    counter.markReviewed("p1-b", "3");
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    const p1 = count.querySelector<HTMLElement>('[data-priority="P1"]');
    expect(p1?.dataset.count).toBe("0");
    expect(p1?.dataset.complete).toBe("true");

    counter.uninstall();
    expect(count.innerHTML).toBe("native counter");
  });
});
