import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SiyuanSnippet } from "./snippet-audit";

let registry: SiyuanSnippet[] = [];

vi.mock("@/api", () => ({
  request: vi.fn(async (url: string) => url === "/api/snippet/getSnippet"
    ? { snippets: structuredClone(registry) }
    : undefined),
  requestStrict: vi.fn(async (url: string, data: { snippets?: SiyuanSnippet[]; enabledCSS?: boolean; enabledJS?: boolean }) => {
    if (url === "/api/snippet/setSnippet" && data.snippets) registry = structuredClone(data.snippets);
    if (url === "/api/setting/setSnippet" && window.siyuan?.config?.snippet) {
      Object.assign(window.siyuan.config.snippet, data);
    }
  }),
}));

import SnippetAuditSettings from "./SnippetAuditSettings.svelte";

let mounted: ReturnType<typeof mount>[] = [];

beforeEach(() => {
  registry = [{
    id: "tag-style",
    name: "Tag style",
    type: "css",
    enabled: true,
    disabledInPublish: false,
    content: '[data-type="tag"] { outline: 7px solid rgb(1, 2, 3); }',
  }];
  window.siyuan ??= {} as typeof window.siyuan;
  window.siyuan.config ??= {} as NonNullable<typeof window.siyuan>["config"];
  window.siyuan.config.snippet = { enabledCSS: true, enabledJS: true };
});

afterEach(async () => {
  await Promise.all(mounted.map((component) => unmount(component)));
  mounted = [];
  document.body.innerHTML = "";
});

async function render() {
  const target = document.createElement("div");
  target.className = "damophus-theme-root";
  document.body.append(target);
  mounted.push(mount(SnippetAuditSettings, { target, props: { title: "Snippet workspace" } }));
  await vi.waitFor(() => expect(target.querySelector(".snippet-row")).not.toBeNull());
  await tick();
  return target;
}

function previewSource(target: HTMLElement): string {
  return target.querySelector<HTMLIFrameElement>("[data-snippet-visual-preview] iframe")?.srcdoc ?? "";
}

describe("Snippet workspace interactions", () => {
  it("keeps edit and delete actions in the left snippet row", async () => {
    const target = await render();
    const list = target.querySelector<HTMLElement>(".snippet-list")!;
    const detail = target.querySelector<HTMLElement>("article")!;

    expect(list.querySelector('[aria-label="Edit: Tag style"]')).not.toBeNull();
    expect(list.querySelector('[aria-label="Delete: Tag style"]')).not.toBeNull();
    expect(detail.querySelector('[aria-label="Edit: Tag style"]')).toBeNull();
    expect(detail.querySelector('[aria-label="Delete: Tag style"]')).toBeNull();
  });

  it("adds and removes CSS from the preview as the snippet switch changes", async () => {
    const target = await render();
    expect(previewSource(target)).toContain("outline: 7px solid rgb(1, 2, 3)");

    let snippetSwitch = target.querySelector<HTMLButtonElement>('[role="switch"][aria-label^="Tag style:"]')!;
    snippetSwitch.click();
    await tick();
    await vi.waitFor(() => expect(previewSource(target)).not.toContain("outline: 7px solid rgb(1, 2, 3)"));

    await vi.waitFor(() => {
      snippetSwitch = target.querySelector<HTMLButtonElement>('[role="switch"][aria-label^="Tag style:"]')!;
      expect(snippetSwitch.disabled).toBe(false);
    });
    snippetSwitch.click();
    await tick();
    await vi.waitFor(() => expect(previewSource(target)).toContain("outline: 7px solid rgb(1, 2, 3)"));
  });

  it("removes CSS from the preview when the global CSS switch is off", async () => {
    const target = await render();
    target.querySelector<HTMLButtonElement>('[role="switch"][aria-label="Enable all CSS snippets"]')!.click();
    await tick();

    await vi.waitFor(() => expect(previewSource(target)).not.toContain("outline: 7px solid rgb(1, 2, 3)"));
  });
});
