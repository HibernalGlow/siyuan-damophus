import type { ConfiguredAction } from "./actions";

export function renderConfiguredActionsDock(
  target: HTMLElement,
  actions: readonly ConfiguredAction[],
  execute: (action: ConfiguredAction) => void,
): () => void {
  const toolbar = document.createElement("div");
  toolbar.className = "damophus-layout-actions";
  toolbar.setAttribute("role", "toolbar");

  for (const action of actions) {
    const button = document.createElement("button");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    const text = document.createElement("span");
    button.type = "button";
    button.className = "b3-button b3-button--outline damophus-layout-actions__button";
    button.title = action.title;
    button.setAttribute("aria-label", action.title);
    svg.setAttribute("aria-hidden", "true");
    use.setAttribute("href", `#${action.icon}`);
    text.textContent = action.title;
    svg.append(use);
    button.append(svg, text);
    button.addEventListener("click", () => execute(action));
    toolbar.append(button);
  }

  target.replaceChildren(toolbar);
  return () => target.replaceChildren();
}
