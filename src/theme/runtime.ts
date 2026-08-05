import type { DamophusTheme, ThemeVariables, TweakcnVariableName } from "./schema";
import { TWEAKCN_VARIABLE_NAMES } from "./schema";

export type ColorMode = "light" | "dark";

const PRESERVED_ONLY_VARIABLES = new Set<TweakcnVariableName>([
  "font-mono",
  "font-sans",
  "font-serif",
  "letter-spacing",
  "tracking-normal",
  "tracking-tight",
  "tracking-tighter",
  "tracking-wide",
  "tracking-wider",
  "tracking-widest",
]);

export function getHostColorMode(): ColorMode {
  if (typeof window === "undefined") return "light";
  const configuredMode = window.siyuan?.config?.appearance?.mode;
  if (configuredMode === 1) return "dark";
  if (configuredMode === 0) return "light";
  if (document.documentElement.classList.contains("dark")) return "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyThemeVariables(
  element: HTMLElement,
  theme: DamophusTheme,
  mode: ColorMode,
): void {
  element.dataset.colorMode = mode;
  element.classList.toggle("dark", mode === "dark");
  for (const name of TWEAKCN_VARIABLE_NAMES) element.style.removeProperty(`--${name}`);
  const variables = theme.cssVars[mode];
  for (const [name, value] of Object.entries(variables) as [TweakcnVariableName, string][]) {
    if (PRESERVED_ONLY_VARIABLES.has(name)) continue;
    element.style.setProperty(`--${name}`, value);
  }
}

export function markerThemeVariables(theme: DamophusTheme, mode: ColorMode): ThemeVariables {
  const variables = theme.cssVars[mode];
  return {
    primary: variables.primary,
    "primary-foreground": variables["primary-foreground"],
    accent: variables.accent,
    "accent-foreground": variables["accent-foreground"],
    border: variables.border,
    foreground: variables.foreground,
    radius: variables.radius,
  };
}

export function observeHostColorMode(onChange: (mode: ColorMode) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const notify = () => onChange(getHostColorMode());
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme-mode", "style"],
  });
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  media?.addEventListener?.("change", notify);
  return () => {
    observer.disconnect();
    media?.removeEventListener?.("change", notify);
  };
}
