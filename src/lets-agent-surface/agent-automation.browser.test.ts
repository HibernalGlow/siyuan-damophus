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

function installPermissionSelector(panel: HTMLElement) {
  const button = document.createElement("button");
  button.className = "agent-chat__permission";
  button.innerHTML = '<span class="agent-chat__permission-label">Ask every time</span>';
  panel.append(button);

  const menu = document.createElement("div");
  menu.id = "commonMenu";
  menu.dataset.name = "agent-chat-permission";
  document.body.append(menu);
  const automaticAllow = vi.fn(() => {
    button.querySelector<HTMLElement>(".agent-chat__permission-label")!.textContent = "Allow automatically";
    menu.replaceChildren();
  });
  button.addEventListener("click", () => {
    menu.innerHTML = `
      <button class="b3-menu__item b3-menu__item--selected">Ask every time</button>
      <button class="b3-menu__item">Allow automatically</button>
    `;
    menu.querySelector<HTMLButtonElement>(".b3-menu__item:last-child")!
      .addEventListener("click", automaticAllow);
  });
  return { button, automaticAllow };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("AgentAutomationController", () => {
  it("defaults every new YOLO session to automatic permission", async () => {
    vi.useFakeTimers();
    const panel = renderAgentPanel();
    const { button, automaticAllow } = installPermissionSelector(panel);
    const controller = new AgentAutomationController(document.body, {
      isYoloEnabled: () => true,
      approvalDelayMs: () => 0,
      preserveNewSessionDraft: () => true,
    });
    controller.start();

    await vi.runAllTimersAsync();
    expect(button.textContent).toBe("Allow automatically");
    expect(automaticAllow).toHaveBeenCalledOnce();

    panel.querySelector<HTMLButtonElement>('[data-type="new-session"]')!.addEventListener("click", () => {
      button.querySelector<HTMLElement>(".agent-chat__permission-label")!.textContent = "Ask every time";
    });
    panel.querySelector<HTMLButtonElement>('[data-type="new-session"]')!.click();
    await Promise.resolve();
    await vi.runAllTimersAsync();

    expect(button.textContent).toBe("Allow automatically");
    expect(automaticAllow).toHaveBeenCalledTimes(2);
    controller.stop();
  });

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

    await vi.advanceTimersByTimeAsync(16);
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
