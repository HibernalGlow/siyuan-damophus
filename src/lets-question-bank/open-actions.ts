import type { IMenu } from "siyuan";

export type QuestionBankOpenAction = "current" | "opposite" | "sidebar";

export interface OpenActionLabels {
  current: string;
  opposite: string;
  sidebar: string;
}

export function focusWindow(element: HTMLElement | null): void {
  if (!element) return;
  const tab = element.querySelector<HTMLElement>(".layout-tab-bar .item")
    ?? element.querySelector<HTMLElement>(".layout-tab-bar");
  (tab ?? element).dispatchEvent(new MouseEvent("click", { bubbles: true, view: window }));
}

export function oppositeWindow(): HTMLElement | null {
  const centers = [...document.querySelectorAll<HTMLElement>(".layout__wnd--center")];
  const windows = centers.map((center) =>
    center.querySelector<HTMLElement>(".layout__wnd")
      ?? center.querySelector<HTMLElement>("[data-type=wnd]")
      ?? center,
  );
  if (windows.length < 2) return null;
  const active = document.querySelector<HTMLElement>(".layout__wnd--active") ?? windows[0];
  const activeRect = active.getBoundingClientRect();
  const center = activeRect.left + activeRect.width / 2;
  const ordered = windows.slice().sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
  const last = ordered[ordered.length - 1];
  const workspaceCenter = (ordered[0].getBoundingClientRect().left + last.getBoundingClientRect().right) / 2;
  return center >= workspaceCenter ? ordered[0] : last;
}

export function createQuestionBankMenuItem(
  label: string,
  labels: OpenActionLabels,
  onAction: (action: QuestionBankOpenAction) => void,
): IMenu {
  return {
    icon: "iconDatabase",
    label,
    click: () => {
      onAction("current");
    },
    bind: (element) => {
      element.classList.add("damophus-question-bank-menu-item");
      const actions = document.createElement("span");
      actions.className = "damophus-question-bank-menu-actions";
      const icons: Record<QuestionBankOpenAction, string> = {
        current: "iconFocus",
        opposite: "iconSplitLR",
        sidebar: "iconPanelLeft",
      };
      (Object.keys(icons) as QuestionBankOpenAction[]).forEach((action) => {
        const control = document.createElement("span");
        control.className = "damophus-question-bank-menu-action";
        control.setAttribute("role", "button");
        control.tabIndex = 0;
        control.title = labels[action];
        control.setAttribute("aria-label", labels[action]);
        control.innerHTML = `<svg><use xlink:href="#${icons[action]}"></use></svg>`;
        const activate = (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
          onAction(action);
          window.siyuan?.menus?.menu?.remove();
        };
        control.addEventListener("click", activate);
        control.addEventListener("keydown", (event) => {
          if (event instanceof KeyboardEvent && (event.key === "Enter" || event.key === " ")) activate(event);
        });
        actions.append(control);
      });
      element.append(actions);
    },
  };
}
