import { PANEL_LAYOUT_ACTIONS, type PanelLayoutCommand } from "./actions";

type LayoutActionLabels = Record<PanelLayoutCommand, string>;

export function renderLayoutActionsDock(
  target: HTMLElement,
  labels: LayoutActionLabels,
  execute: (command: PanelLayoutCommand) => void,
): () => void {
  const toolbar = document.createElement("div");
  toolbar.className = "damophus-layout-actions";
  toolbar.setAttribute("role", "toolbar");

  for (const action of PANEL_LAYOUT_ACTIONS) {
    const label = labels[action.command];
    const button = document.createElement("button");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    const text = document.createElement("span");
    button.type = "button";
    button.className = "b3-button b3-button--outline damophus-layout-actions__button";
    button.title = label;
    button.setAttribute("aria-label", label);
    svg.setAttribute("aria-hidden", "true");
    use.setAttribute("href", `#${action.icon}`);
    text.textContent = label;
    svg.append(use);
    button.append(svg, text);
    button.addEventListener("click", () => execute(action.command));
    toolbar.append(button);
  }

  target.replaceChildren(toolbar);
  return () => target.replaceChildren();
}
