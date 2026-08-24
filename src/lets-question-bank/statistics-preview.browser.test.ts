import { afterEach, describe, expect, it } from "vitest";
import "@/styles/damophus.css";
import { openStatisticsCardPreview, type StatisticsPreviewDialog } from "./statistics-preview";

let activeDialog: FakeDialog | undefined;

class FakeDialog implements StatisticsPreviewDialog {
  element = document.createElement("div");
  private readonly destroyCallback: () => void;

  constructor(options: { title: string; content: string; width: string; height: string; destroyCallback: () => void }) {
    this.destroyCallback = options.destroyCallback;
    this.element.innerHTML = options.content;
    document.body.appendChild(this.element);
    activeDialog = this;
  }

  destroy(): void {
    this.destroyCallback();
    this.element.remove();
  }
}

afterEach(() => {
  document.body.innerHTML = "";
  activeDialog = undefined;
});

describe("statistics card Dialog preview", () => {
  it("moves a card into a full-screen mobile Dialog and restores it on destroy", () => {
    const host = document.createElement("div");
    const card = document.createElement("section");
    card.className = "statistics-panel";
    card.dataset.statisticsCardId = "subject-progress";
    const content = document.createElement("div");
    content.className = "statistics-card-content";
    card.append(content);
    const trigger = document.createElement("button");
    host.append(card, trigger);
    document.body.appendChild(host);

    openStatisticsCardPreview(
      { id: "subject-progress", title: "科目进度", card, trigger },
      FakeDialog,
      true,
    );

    const dialogCard = document.querySelector<HTMLElement>(".damophus-statistics-preview-card")!;
    expect(dialogCard.parentElement?.classList.contains("damophus-statistics-preview-scroll")).toBe(true);
    expect(document.querySelector(".damophus-statistics-preview-dialog")).not.toBeNull();
    expect(getComputedStyle(content).overflowY).toBe("auto");

    activeDialog?.destroy();
    expect(host.contains(card)).toBe(true);
    expect(card.classList.contains("damophus-statistics-preview-card")).toBe(false);
  });
});
