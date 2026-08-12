import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { mount, tick, unmount } from "svelte";
import DocumentHistoryDiff from "./document-history-diff.svelte";
import { normalizeHistoryBlockDOM, type DocumentHistoryService } from "./history-service";
import type { HistoryVersion } from "./types";

const versions: HistoryVersion[] = [
  {
    created: "1786521600",
    title: "Administrative license",
    path: "data/.siyuan/history/2026-08-12/example.sy",
    operation: "update",
  },
  {
    created: "1786435200",
    title: "Administrative license",
    path: "data/.siyuan/history/2026-08-11/example.sy",
    operation: "sync",
  },
];

const translations: Record<string, string> = {
  "lets-document-history-diff.history": "History",
  "lets-document-history-diff.current": "Current",
  "lets-document-history-diff.before": "Before",
  "lets-document-history-diff.after": "After",
  "lets-document-history-diff.liveDocument": "Live document",
  "lets-document-history-diff.unified": "Unified",
  "lets-document-history-diff.split": "Side by side",
  "lets-document-history-diff.historySource": "History Kramdown",
  "lets-document-history-diff.currentSource": "Current Kramdown",
  "lets-document-history-diff.copy": "Copy Kramdown",
  "lets-document-history-diff.copyHistory": "Copy before",
  "lets-document-history-diff.copyCurrent": "Copy after",
  "lets-document-history-diff.viewBefore": "View before Kramdown only",
  "lets-document-history-diff.viewAfter": "View after Kramdown only",
  "lets-document-history-diff.refresh": "Refresh history",
  "lets-document-history-diff.resizeHistory": "Resize history list",
  "lets-document-history-diff.copied": "Kramdown copied",
  "lets-document-history-diff.overview": "Document overview",
  "lets-document-history-diff.additions": "additions",
  "lets-document-history-diff.deletions": "deletions",
  "lets-document-history-diff.loading": "Loading comparison",
  "lets-document-history-diff.previous": "Previous page",
  "lets-document-history-diff.next": "Next page",
  "lets-document-history-diff.dialogTitle": "Document history diff",
  "lets-document-history-diff.loadFailed": "Document history could not be loaded.",
  "lets-document-history-diff.empty": "No history versions are available for this document.",
  "lets-document-history-diff.unchanged": "No Kramdown changes in this version.",
};

let mounted: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  if (mounted) await unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
  delete document.documentElement.dataset.themeMode;
  window.sessionStorage.clear();
});

function render(content: { history?: string; current?: string } = {}) {
  const service = {
    loadPage: vi.fn().mockResolvedValue({
      versions,
      page: 1,
      pageCount: 1,
      totalCount: 2,
    }),
    loadVersionKramdown: vi.fn().mockImplementation(async (version: HistoryVersion) => (
      version.created === versions[0].created
        ? content.history ?? "# Administrative license\n\nOld condition\n"
        : "# Administrative license\n\nEarlier condition\n"
    )),
    resolveVersion: vi.fn().mockImplementation(async (version: HistoryVersion) => version),
    loadCurrentKramdown: vi.fn().mockResolvedValue(content.current ?? "# Administrative license\n\nNew condition\n\n{: custom-status=\"done\"}\n"),
    invalidateCurrent: vi.fn(),
  };
  const host = document.createElement("div");
  host.style.width = "100%";
  host.style.height = "720px";
  document.body.appendChild(host);
  mounted = mount(DocumentHistoryDiff, {
    target: host,
    props: {
      service: service as unknown as DocumentHistoryService,
      documentTitle: "Administrative license review",
      translations,
    },
  });
  return { host, service };
}

async function waitForDiff(): Promise<void> {
  await vi.waitFor(() => {
    expect(document.querySelector('[data-component="git-diff-view"]')).not.toBeNull();
  });
  await tick();
}

describe("document history diff review", () => {
  it("loads the newest version and switches between split and unified views", async () => {
    await page.viewport(1280, 820);
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const { service } = render();
    await waitForDiff();

    expect(service.loadPage).toHaveBeenCalledWith(1);
    expect(service.loadVersionKramdown).toHaveBeenCalledWith(versions[0]);
    expect(service.loadCurrentKramdown).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll(".version-row")).toHaveLength(3);
    expect(document.querySelector(".version-row.selected")?.textContent).toContain("Current");
    expect(document.querySelector(".split-diff-view")).not.toBeNull();
    expect(document.querySelectorAll(".overview-marker").length).toBeGreaterThan(0);
    expect(document.querySelector(".overview-window")).not.toBeNull();
    // Git-style line counts include the blank separator before the block IAL.
    expect(document.body.textContent).toContain("3 additions");
    expect(document.body.textContent).toContain("1 deletions");

    const copyHistory = document.querySelector<HTMLButtonElement>('button[title="Copy before"]');
    const copyCurrent = document.querySelector<HTMLButtonElement>('button[title="Copy after"]');
    copyHistory?.click();
    await tick();
    expect(writeText).toHaveBeenLastCalledWith("# Administrative license\n\nOld condition\n");
    copyCurrent?.click();
    await tick();
    expect(writeText).toHaveBeenLastCalledWith("# Administrative license\n\nNew condition\n\n{: custom-status=\"done\"}\n");

    const unifiedButton = [...document.querySelectorAll<HTMLButtonElement>(".view-switch button")]
      .find((button) => button.textContent?.includes("Unified"));
    unifiedButton?.click();
    await tick();

    expect(document.querySelector(".unified-diff-view")?.textContent).toContain("New condition");
    expect(document.querySelector(".split-diff-view")).toBeNull();
  });

  it("keeps controls and content within a narrow viewport", async () => {
    await page.viewport(390, 760);
    const { host } = render();
    host.style.height = "700px";
    await waitForDiff();

    const review = host.querySelector<HTMLElement>(".history-review");
    const header = host.querySelector<HTMLElement>(".review-header");
    const sidebar = host.querySelector<HTMLElement>(".history-sidebar");
    if (!review || !header || !sidebar) throw new Error("Missing history review layout");

    expect(review.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth);
    expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth);
    expect(sidebar.getBoundingClientRect().width).toBeLessThanOrEqual(108);
    expect(document.querySelector(".unified-diff-view")).not.toBeNull();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  });

  it("maps a long document onto an interactive vertical overview", async () => {
    await page.viewport(1100, 760);
    const history = Array.from({ length: 180 }, (_, index) => `line ${index + 1}`).join("\n");
    const current = Array.from({ length: 180 }, (_, index) => (
      index === 90 ? "changed middle" : index === 160 ? "changed end" : `line ${index + 1}`
    )).join("\n");
    render({ history, current });
    await waitForDiff();

    const ruler = document.querySelector<HTMLButtonElement>(".overview-ruler");
    const scroller = document.querySelector<HTMLElement>(".diff-scroll");
    const windowMarker = document.querySelector<HTMLElement>(".overview-window");
    if (!ruler || !scroller || !windowMarker) throw new Error("Missing interactive overview");

    expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
    expect(Number.parseFloat(windowMarker.style.height)).toBeLessThan(100);
    expect(document.querySelectorAll(".overview-marker.delete")).toHaveLength(2);
    expect(document.querySelectorAll(".overview-marker.insert")).toHaveLength(2);

    const rect = ruler.getBoundingClientRect();
    ruler.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      pointerId: 1,
      clientY: rect.top + rect.height * 0.85,
    }));
    await tick();
    expect(scroller.scrollTop).toBeGreaterThan(0);
  });

  it("compares a selected history version with its adjacent older version", async () => {
    await page.viewport(1100, 760);
    const { service } = render();
    await waitForDiff();

    document.querySelectorAll<HTMLButtonElement>(".version-row")[1]?.click();
    await vi.waitFor(() => {
      expect(service.loadVersionKramdown).toHaveBeenCalledWith(versions[1]);
    });

    expect(service.loadCurrentKramdown).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".file-heading:first-child")?.textContent).toContain("Before");
    expect(document.querySelector(".file-heading:nth-child(2)")?.textContent).toContain("After");
    expect(document.querySelector('[data-component="git-diff-view"]')?.textContent).toContain("Earlier condition");
    expect(document.querySelector('[data-component="git-diff-view"]')?.textContent).toContain("Old condition");
  });

  it("keeps long IAL rows isolated within the mature diff view columns", async () => {
    await page.viewport(1280, 820);
    const longValue = `{: custom-data="${"x".repeat(700)}"}`;
    render({ history: `# Title\n\n${longValue}\n`, current: `# Title\n\n${longValue} changed\n` });
    await waitForDiff();

    const diff = document.querySelector<HTMLElement>('[data-component="git-diff-view"]');
    const scroller = document.querySelector<HTMLElement>(".diff-scroll");
    if (!diff || !scroller) throw new Error("Missing diff view");
    expect(diff.scrollWidth).toBeGreaterThan(scroller.clientWidth);
    expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  });

  it("places source view and copy controls in each file heading", async () => {
    await page.viewport(1100, 760);
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render();
    await waitForDiff();

    const headings = document.querySelectorAll<HTMLElement>(".file-heading");
    expect(headings).toHaveLength(2);
    expect(headings[0].querySelectorAll("button")).toHaveLength(2);
    expect(headings[1].querySelectorAll("button")).toHaveLength(2);
    expect(document.querySelector(".review-header")?.querySelectorAll("button")).toHaveLength(3);

    headings[0].querySelector<HTMLButtonElement>('button[title="View before Kramdown only"]')?.click();
    await tick();
    expect(document.querySelector(".source-scroll")?.textContent).toContain("Old condition");
    headings[0].querySelector<HTMLButtonElement>('button[title="Copy before"]')?.click();
    await tick();
    expect(writeText).toHaveBeenLastCalledWith("# Administrative license\n\nOld condition\n");
  });

  it("tracks the SiYuan color mode in the mature diff view", async () => {
    await page.viewport(1100, 760);
    document.documentElement.dataset.themeMode = "light";
    render();
    await waitForDiff();

    const diff = document.querySelector<HTMLElement>('[data-component="git-diff-view"]');
    if (!diff) throw new Error("Missing diff view");
    expect(diff.dataset.theme).toBe("light");

    document.documentElement.dataset.themeMode = "dark";
    await vi.waitFor(() => expect(diff.dataset.theme).toBe("dark"));
    const styleRoot = diff.querySelector<HTMLElement>(".diff-style-root");
    const content = diff.querySelector<HTMLElement>('[data-state="diff"]');
    if (!styleRoot || !content) throw new Error("Missing rendered diff row");
    expect(getComputedStyle(styleRoot).getPropertyValue("--diff-plain-content--").trim()).toBe("#0d1117");
    expect(getComputedStyle(content).color).toBe("rgb(255, 255, 255)");
  });

  it("resizes the history list with pointer and keyboard controls", async () => {
    await page.viewport(1280, 820);
    const { host } = render();
    await waitForDiff();

    const body = host.querySelector<HTMLElement>(".review-body");
    const sidebar = host.querySelector<HTMLElement>(".history-sidebar");
    const resizer = host.querySelector<HTMLElement>(".sidebar-resizer");
    if (!body || !sidebar || !resizer) throw new Error("Missing resizable layout");
    const initialWidth = sidebar.getBoundingClientRect().width;
    const bodyRect = body.getBoundingClientRect();
    resizer.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      pointerId: 7,
      clientX: bodyRect.left + 340,
    }));
    vi.spyOn(resizer, "hasPointerCapture").mockReturnValue(true);
    resizer.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      pointerId: 7,
      clientX: bodyRect.left + 340,
    }));
    await tick();
    expect(sidebar.getBoundingClientRect().width).toBeGreaterThan(initialWidth + 70);
    expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth);

    resizer.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowLeft" }));
    await tick();
    expect(sidebar.getBoundingClientRect().width).toBeLessThan(340);
    expect(resizer.getAttribute("aria-valuenow")).toBe(String(Math.round(sidebar.getBoundingClientRect().width)));
  });

  it("unwraps read-only history containers before Lute conversion", () => {
    const content = [
      '<div data-type="NodeHeading" data-subtype="h1">',
      '<div contenteditable="false" spellcheck="false">09 考点9：破产法概述</div>',
      "</div>",
      '<div data-type="NodeParagraph">',
      '<div contenteditable="false" spellcheck="false"><span data-type="strong">违法转让</span></div>',
      "</div>",
    ].join("");

    const normalized = normalizeHistoryBlockDOM(content);
    expect(normalized).not.toContain("contenteditable");
    expect(normalized).not.toContain("spellcheck");
    expect(normalized).toContain('<span data-type="strong">违法转让</span>');
  });
});
