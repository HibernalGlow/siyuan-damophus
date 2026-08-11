import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentPanelPortal, type AgentPanelModel } from "./agent-panel-portal";

function renderPanel(): { origin: HTMLElement; panel: HTMLElement } {
  const origin = document.createElement("div");
  origin.id = "modelMain";
  const panel = document.createElement("section");
  panel.className = "sy__agentChat";
  panel.innerHTML = `
    <div class="agent-chat__messages" style="height: 40px; overflow: auto">
      <div class="agent-chat__msg" style="height: 200px">Existing answer</div>
    </div>
    <div class="agent-chat__composer-host"><div class="protyle-wysiwyg">Unsent draft</div></div>
  `;
  origin.append(panel);
  document.body.append(origin);
  return { origin, panel };
}

afterEach(() => document.body.replaceChildren());

describe("AgentPanelPortal", () => {
  it("keeps the same Agent panel and state across mobile Dock switches", async () => {
    const { origin, panel } = renderPanel();
    const messages = panel.querySelector<HTMLElement>(".agent-chat__messages")!;
    messages.scrollTop = 48;
    const model: AgentPanelModel = { panelElement: panel };
    const portal = new AgentPanelPortal(async () => model);
    const dock = document.createElement("aside");
    document.body.append(dock);

    await expect(portal.attach(dock)).resolves.toBe(true);
    expect(dock.firstElementChild).toBe(panel);
    expect(messages.scrollTop).toBe(48);
    panel.querySelector<HTMLElement>(".protyle-wysiwyg")!.textContent = "Updated draft";

    portal.detach(dock);
    expect(origin.firstElementChild).toBe(panel);
    expect(messages.scrollTop).toBe(48);
    expect(panel.querySelector(".protyle-wysiwyg")?.textContent).toBe("Updated draft");

    await expect(portal.attach(dock)).resolves.toBe(true);
    expect(dock.firstElementChild).toBe(panel);
    expect(panel.querySelector(".agent-chat__msg")?.textContent).toBe("Existing answer");
    expect(panel.querySelector(".protyle-wysiwyg")?.textContent).toBe("Updated draft");
    expect(messages.scrollTop).toBe(48);
    portal.stop();
  });

  it("does not attach after the user switches away during initialization", async () => {
    const { origin, panel } = renderPanel();
    let resolveModel: ((model: AgentPanelModel) => void) | undefined;
    const modelPromise = new Promise<AgentPanelModel>((resolve) => resolveModel = resolve);
    const onCancelled = vi.fn();
    const portal = new AgentPanelPortal(() => modelPromise, undefined, onCancelled);
    const dock = document.createElement("aside");
    document.body.append(dock);

    const attachment = portal.attach(dock);
    portal.detach(dock);
    resolveModel?.({ panelElement: panel });

    await expect(attachment).resolves.toBe(false);
    expect(origin.firstElementChild).toBe(panel);
    expect(dock.childElementCount).toBe(0);
    expect(onCancelled).toHaveBeenCalledOnce();
  });
});
