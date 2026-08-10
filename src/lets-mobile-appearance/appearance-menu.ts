import { fetchPost, Menu } from "siyuan";

type AppearanceMode = 0 | 1 | 2;

function applyAppearanceMode(value: AppearanceMode): void {
  const appearance = window.siyuan?.config?.appearance;
  if (!appearance) return;

  const systemMode = window.matchMedia("(prefers-color-scheme: dark)").matches ? 1 : 0;
  fetchPost("/api/setting/setAppearance", {
    ...appearance,
    mode: value === 2 ? systemMode : value,
    modeOS: value === 2,
  });
}

export function openMobileAppearanceMenu(): void {
  const appearance = window.siyuan?.config?.appearance;
  if (!appearance) return;

  const languages = window.siyuan?.languages ?? {};
  const menu = new Menu("siyuan-damophus-mobile-appearance");
  menu.addItem({
    id: "damophusThemeLight",
    icon: "iconLight",
    label: languages.themeLight ?? "Light",
    current: appearance.mode === 0 && !appearance.modeOS,
    click: () => applyAppearanceMode(0),
  });
  menu.addItem({
    id: "damophusThemeDark",
    icon: "iconDark",
    label: languages.themeDark ?? "Dark",
    current: appearance.mode === 1 && !appearance.modeOS,
    click: () => applyAppearanceMode(1),
  });
  menu.addItem({
    id: "damophusThemeOS",
    icon: "iconMode",
    label: languages.themeOS ?? "Follow system",
    current: appearance.modeOS,
    click: () => applyAppearanceMode(2),
  });
  menu.fullscreen();
}
