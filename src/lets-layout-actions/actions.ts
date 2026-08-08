export const PANEL_LAYOUT_ACTIONS = [
  {
    command: "switchLeftDock",
    labelKey: "lets-layout-actions.switchLeft",
    icon: "iconLeft",
  },
  {
    command: "switchRightDock",
    labelKey: "lets-layout-actions.switchRight",
    icon: "iconRight",
  },
  {
    command: "switchBottomDock",
    labelKey: "lets-layout-actions.switchBottom",
    icon: "iconDown",
  },
] as const;

export type PanelLayoutCommand = (typeof PANEL_LAYOUT_ACTIONS)[number]["command"];

export function executeSiyuanCommand(
  command: string,
  execute: (command: string) => void,
): void {
  execute(command);
}
