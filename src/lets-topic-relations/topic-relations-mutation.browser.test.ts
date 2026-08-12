import { describe, expect, it, vi } from "vitest";
import { topicRelationMutationNeedsRefresh } from "./index";

async function mutationFor(markup: string): Promise<MutationRecord> {
  document.body.innerHTML = `<div class="protyle-wysiwyg" id="root">${markup}</div>`;
  const root = document.querySelector<HTMLElement>("#root");
  const target = root?.firstElementChild;
  if (!root || !target) throw new Error("Missing mutation fixture");
  let captured: MutationRecord | undefined;
  const observer = new MutationObserver((records) => { captured = records[0]; });
  observer.observe(root, { childList: true });
  target.remove();
  await vi.waitFor(() => expect(captured).toBeDefined());
  observer.disconnect();
  return captured!;
}

describe("topic relation deletion mutations", () => {
  it("ignores deletion of an ordinary editor block", async () => {
    expect(topicRelationMutationNeedsRefresh(await mutationFor(
      '<div data-node-id="20260812000000-plain01">Plain</div>',
    ))).toBe(false);
  });

  it("refreshes when the deleted block owns a topic relation", async () => {
    expect(topicRelationMutationNeedsRefresh(await mutationFor(
      '<div data-node-id="20260812000000-topic01" custom-qb-note-topic-id="civil-topic">Topic</div>',
    ))).toBe(true);
  });

  it("uses tracked targets instead of rescanning a deleted container subtree", async () => {
    document.body.innerHTML = `<div id="outer"><div id="tracked"></div></div>`;
    const outer = document.querySelector<HTMLElement>("#outer");
    const tracked = document.querySelector<HTMLElement>("#tracked");
    if (!outer || !tracked) throw new Error("Missing tracked fixture");
    let captured: MutationRecord | undefined;
    const observer = new MutationObserver((records) => { captured = records[0]; });
    observer.observe(document.body, { childList: true });
    outer.remove();
    await vi.waitFor(() => expect(captured).toBeDefined());
    observer.disconnect();
    expect(topicRelationMutationNeedsRefresh(captured!, new Set([tracked]))).toBe(true);
  });
});
