import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import NetworkAssetsLocalPreview from "./NetworkAssetsLocalPreview.svelte";

vi.mock("@/api", () => ({
  sqlStrict: vi.fn((statement: string) => {
    if (statement.includes("LIMIT 1")) return [{ id: "document", box: "box", hpath: "/Notes/Topic 88" }];
    if (statement.includes("hpath LIKE")) return [{ id: "document", box: "box", hpath: "/Notes/Topic 88" }];
    return [{ id: "image", type: "p" }];
  }),
  getBlockKramdownStrict: vi.fn().mockResolvedValue({
    id: "image", kramdown: "![](file:///D:/notes/image.jpg) ![](https://example.com/image.png)",
  }),
  convertNetworkAssetsToLocalStrict: vi.fn(),
  updateBlockStrict: vi.fn(),
}));

let mounted: ReturnType<typeof mount>[] = [];

afterEach(async () => {
  await Promise.all(mounted.map((component) => unmount(component)));
  mounted = [];
  document.body.replaceChildren();
});

function render(): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  mounted.push(mount(NetworkAssetsLocalPreview, {
    target: container,
    props: {
      documentId: "document",
      labels: {
        title: "Network asset conversion", description: "Review resources before conversion", refresh: "Refresh",
        scanning: "Scanning", summary: "{documents} documents, {resources} resources", scope: "This document and descendants",
        empty: "No resources", documents: "Documents", resourceCount: "{count} resources", convert: "Convert listed resources",
        running: "Converting", progress: "{current}/{total}", completed: "Completed", regex: "Excluded URL regex",
        regexPlaceholder: "example.com", skipSelected: "Skip selected", openDocument: "Open document",
        locateDocument: "Locate document", deleteDocument: "Delete document", filters: "Rules",
      },
      blockTypes: ["NodeParagraph"], defaultExcludedPattern: "", onDocumentOpen: vi.fn(), onDocumentLocate: vi.fn(), onDocumentDelete: vi.fn(),
    },
  }));
  return container;
}

describe("network asset preview workbench", () => {
  it("keeps conversion controls above the grouped resource list and reveals rules on demand", async () => {
    const container = render();
    await tick();
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const commandBar = container.querySelector(".damophus-network-assets-local__command-bar");
    const documents = container.querySelector(".damophus-network-assets-local__documents");
    const resourceRows = container.querySelectorAll(".damophus-network-assets-local__documents li");
    if (!commandBar || !documents) throw new Error("Missing conversion workbench controls");

    expect(commandBar.compareDocumentPosition(documents) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(resourceRows).toHaveLength(2);
    expect(container.textContent).toContain("file:///D:/notes/image.jpg");
    expect(container.querySelector(".damophus-network-assets-local__filters")).toBeNull();

    const rules = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Rules"));
    if (!rules) throw new Error("Missing rules button");
    rules.click();
    await tick();
    expect(container.querySelector(".damophus-network-assets-local__filters")).not.toBeNull();
  });
});
