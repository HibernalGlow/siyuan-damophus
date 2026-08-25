import { afterEach, describe, expect, it } from "vitest";
import "./question-bank.css";

const neoIdeTabOffset = 42;

function renderTabSurface(footerClass: "action-bar" | "rating-bar"): {
  container: HTMLElement;
  footer: HTMLElement;
  host: HTMLElement;
} {
  document.documentElement.classList.add("neo-ide");
  document.body.classList.add("neo-ide-body", "body--toolbar-hide");
  document.body.innerHTML = `
    <style>
      .neo-ide-body.body--toolbar-hide .layout-tab-container > .fn__flex-1:not(.protyle) {
        margin-top: ${neoIdeTabOffset}px;
      }
    </style>
    <div class="layout-tab-container" style="height: 675px; overflow: auto;">
      <div class="fn__flex-1 damophus-question-bank-host damophus-question-bank-tab-host" style="height: 100%;">
        <main class="question-bank" style="height: 100%; display: flex; flex-direction: column;">
          <section class="practice" style="min-height: 0; flex: 1; display: flex; flex-direction: column;">
            <div class="practice-content" style="min-height: 0; flex: 1;"></div>
            <div class="${footerClass}" style="height: 48px;"></div>
          </section>
        </main>
      </div>
    </div>`;

  return {
    container: document.querySelector<HTMLElement>(".layout-tab-container")!,
    footer: document.querySelector<HTMLElement>(`.${footerClass}`)!,
    host: document.querySelector<HTMLElement>(".damophus-question-bank-tab-host")!,
  };
}

afterEach(() => {
  document.documentElement.classList.remove("neo-ide");
  document.body.className = "";
  document.body.replaceChildren();
});

describe("question bank Neo+ IDE tab layout", () => {
  it.each(["action-bar", "rating-bar"] as const)(
    "keeps the %s inside the shortened custom-tab viewport",
    (footerClass) => {
      const { container, footer, host } = renderTabSurface(footerClass);
      const containerRect = container.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();

      expect(hostRect.top - containerRect.top).toBe(neoIdeTabOffset);
      expect(hostRect.bottom).toBe(containerRect.bottom);
      expect(container.scrollHeight).toBe(container.clientHeight);
      expect(footerRect.bottom).toBeLessThanOrEqual(containerRect.bottom);
    },
  );

  it("does not shorten non-tab question-bank surfaces", () => {
    document.documentElement.classList.add("neo-ide");
    document.body.classList.add("neo-ide-body", "body--toolbar-hide");
    document.body.innerHTML = `
      <div style="height: 675px;">
        <div class="damophus-question-bank-host" style="height: 100%;"></div>
      </div>`;

    const host = document.querySelector<HTMLElement>(".damophus-question-bank-host")!;
    expect(host.getBoundingClientRect().height).toBe(675);
  });
});
