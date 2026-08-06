import { afterEach, describe, expect, it, vi } from "vitest";
import { installSourceAnswerMask } from "./source-answer-mask";

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.body.innerHTML = "";
  document.head.querySelector("#damophus-source-answer-mask-style")?.remove();
});

function sourceDocument(markup: string): void {
  document.body.innerHTML = `<div class="protyle-wysiwyg">${markup}</div>`;
}

describe("source answer masking", () => {
  it("masks only answer letters in each solution region", () => {
    sourceDocument(`
      <div data-node-id="q1" custom-qb-id="q1" custom-qb-answer="B">Question 1</div>
      <div data-node-id="solution1" custom-qb-section="solution"><p data-node-id="solution1-p">答案：B。解析中仍然可以提到 A 选项。</p></div>
      <div data-node-id="q2" custom-qb-id="q2" custom-qb-answer="A,C">Question 2</div>
      <div data-node-id="solution2" custom-qb-section="solution"><p data-node-id="solution2-p">正确答案为 A、C。</p></div>
    `);

    cleanup = installSourceAnswerMask("solid");

    expect(document.querySelectorAll("[data-damophus-answer-mask]")).toHaveLength(3);
    expect(document.querySelectorAll('[data-damophus-answer-mask="solid"]')).toHaveLength(3);
    expect(document.querySelector("#solution1")?.textContent).toContain("A 选项");
    expect(document.querySelector("#solution1")?.textContent).toContain("答案：B");
  });

  it("does not mask a question without a solution marker or answer IAL", () => {
    sourceDocument(`
      <div data-node-id="q1" custom-qb-id="q1">Question 1</div>
      <div data-node-id="solution1" custom-qb-section="solution">答案：A</div>
      <div data-node-id="q2" custom-qb-id="q2" custom-qb-answer="A">Question 2</div>
      <div data-node-id="plain2">答案：A</div>
    `);

    cleanup = installSourceAnswerMask();

    expect(document.querySelectorAll("[data-damophus-answer-mask]")).toHaveLength(0);
  });

  it("handles lazy-loaded blocks, remains idempotent, and reveals on click", async () => {
    sourceDocument("");
    cleanup = installSourceAnswerMask();
    const root = document.querySelector<HTMLElement>(".protyle-wysiwyg");
    if (!root) throw new Error("Missing editor root");
    root.innerHTML = `
      <div data-node-id="q1" custom-qb-id="q1" custom-qb-answer="A,C">Question</div>
      <div data-node-id="solution1" custom-qb-section="solution">答案：A、C</div>
    `;

    await vi.waitFor(() => expect(root.querySelectorAll("[data-damophus-answer-mask]")).toHaveLength(2));
    await vi.waitFor(() => expect(root.querySelectorAll("[data-damophus-answer-mask]")).toHaveLength(2));
    const mask = root.querySelector<HTMLElement>("[data-damophus-answer-mask]");
    if (!mask) throw new Error("Missing answer mask");
    mask.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(mask.dataset.damophusAnswerRevealed).toBe("true");
  });
});
