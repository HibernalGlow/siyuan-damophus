import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentAutomationController } from "./agent-automation";

function renderAgentPanel(): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "sy__agentChat";
  panel.innerHTML = `
    <button class="block__icon" data-type="new-session">New</button>
    <div class="agent-chat__messages"></div>
    <div class="agent-chat__composer-host">
      <div class="protyle-wysiwyg" contenteditable="true"><div data-node-id="draft"><div></div></div></div>
    </div>
  `;
  document.body.append(panel);
  return panel;
}

function appendConfirm(panel: HTMLElement) {
  const card = document.createElement("div");
  card.className = "agent-chat__msg agent-chat__msg--confirm";
  card.innerHTML = `
    <div class="agent-chat__confirm-header">Agent: file operation</div>
    <div class="agent-chat__confirm-actions">
      <button class="agent-chat__confirm-reject">Reject</button>
      <button class="agent-chat__confirm-always">Session Allow</button>
    </div>
  `;
  panel.querySelector(".agent-chat__messages")?.append(card);
  return card;
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("AgentAutomationController", () => {
  it("immediately chooses Session Allow for a new permission card", async () => {
    vi.useFakeTimers();
    const panel = renderAgentPanel();
    const controller = new AgentAutomationController(document.body, {
      isYoloEnabled: () => true,
      approvalDelayMs: () => 0,
      preserveNewSessionDraft: () => true,
    });
    controller.start();
    const card = appendConfirm(panel);
    const alwaysAllow = card.querySelector<HTMLButtonElement>(".agent-chat__confirm-always")!;
    const approved = vi.fn(() => card.classList.add("agent-chat__msg--confirmed"));
    alwaysAllow.addEventListener("click", approved);

    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(approved).toHaveBeenCalledOnce();
    controller.stop();
  });

  it("shows a delayed notice and respects a manual rejection", async () => {
    vi.useFakeTimers();
    const panel = renderAgentPanel();
    const notifyApproval = vi.fn();
    const controller = new AgentAutomationController(document.body, {
      isYoloEnabled: () => true,
      approvalDelayMs: () => 3000,
      notifyApproval,
      preserveNewSessionDraft: () => true,
    });
    controller.start();
    const card = appendConfirm(panel);
    const alwaysAllow = card.querySelector<HTMLButtonElement>(".agent-chat__confirm-always")!;
    const approved = vi.fn();
    alwaysAllow.addEventListener("click", approved);

    await Promise.resolve();
    expect(notifyApproval).toHaveBeenCalledWith({
      description: "Agent: file operation",
      delayMs: 3000,
    });
    card.querySelector<HTMLButtonElement>(".agent-chat__confirm-reject")!.click();
    await vi.advanceTimersByTimeAsync(3000);

    expect(approved).not.toHaveBeenCalled();
    controller.stop();
  });

  it("restores rich input after the native new-session handler clears it", async () => {
    const panel = renderAgentPanel();
    const editor = panel.querySelector<HTMLElement>(".protyle-wysiwyg")!;
    const draft = '<div data-node-id="draft"><div>Keep <span data-type="block-ref" data-id="block-a">this block</span></div></div>';
    editor.innerHTML = draft;
    const controller = new AgentAutomationController(document.body, {
      isYoloEnabled: () => false,
      approvalDelayMs: () => 0,
      preserveNewSessionDraft: () => true,
    });
    controller.start();
    panel.querySelector<HTMLButtonElement>('[data-type="new-session"]')!.addEventListener("click", () => {
      editor.innerHTML = '<div data-node-id="empty"><div></div></div>';
    });

    panel.querySelector<HTMLButtonElement>('[data-type="new-session"]')!.click();
    await Promise.resolve();

    expect(editor.innerHTML).toBe(draft);
    controller.stop();
  });
});
