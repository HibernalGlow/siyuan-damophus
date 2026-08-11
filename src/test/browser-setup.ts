import "@/styles/damophus.css";
import { BUILTIN_THEMES } from "@/theme/themes";

const browserTheme = BUILTIN_THEMES.find((theme) => theme.name === "elegant-luxury")
  ?? BUILTIN_THEMES[0];
const variables = browserTheme.cssVars.light;
const hostVariables: Record<string, string> = {
  "--b3-theme-primary": variables.primary,
  "--b3-theme-primary-light": `color-mix(in srgb, ${variables.primary} 54%, transparent)`,
  "--b3-theme-primary-lighter": `color-mix(in srgb, ${variables.primary} 38%, transparent)`,
  "--b3-theme-primary-lightest": `color-mix(in srgb, ${variables.primary} 12%, transparent)`,
  "--b3-theme-secondary": variables.secondary,
  "--b3-theme-background": variables.background,
  "--b3-theme-background-light": variables.muted,
  "--b3-theme-surface": variables.card,
  "--b3-theme-surface-light": `color-mix(in srgb, ${variables.card} 86%, transparent)`,
  "--b3-theme-surface-lighter": variables.border,
  "--b3-theme-error": variables.destructive,
  "--b3-theme-success": "oklch(0.58 0.14 145)",
  "--b3-theme-on-primary": variables["primary-foreground"],
  "--b3-theme-on-secondary": variables["secondary-foreground"],
  "--b3-theme-on-background": variables.foreground,
  "--b3-theme-on-surface": variables["muted-foreground"],
  "--b3-theme-on-surface-light": `color-mix(in srgb, ${variables["muted-foreground"]} 68%, transparent)`,
  "--b3-theme-on-error": variables["destructive-foreground"],
  "--b3-font-family": 'BlinkMacSystemFont, Helvetica, "DejaVu Sans", Arial, sans-serif',
  "--b3-font-family-code": '"JetBrains Mono", Consolas, "Liberation Mono", monospace',
  "--b3-font-size": "14px",
  "--b3-border-color": variables.border,
  "--b3-border-radius": variables.radius,
  "--b3-border-radius-s": "3px",
  "--b3-border-radius-b": "12px",
  "--b3-list-hover": variables.accent,
  "--b3-menu-background": variables.popover,
  "--b3-dialog-shadow": variables.shadow ?? "0 8px 24px rgb(0 0 0 / 18%)",
  "--b3-card-error-color": variables.destructive,
  "--b3-card-warning-color": variables["secondary-foreground"],
};

document.documentElement.dataset.damophusBrowserTheme = browserTheme.name;
document.documentElement.style.colorScheme = "light";
for (const [name, value] of Object.entries(hostVariables)) {
  document.documentElement.style.setProperty(name, value);
}
