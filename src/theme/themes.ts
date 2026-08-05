import type { DamophusTheme } from "./schema";

export const DEFAULT_THEME_ID = "builtin:damophus-red-gold";

export const BUILTIN_THEMES: readonly DamophusTheme[] = [
  {
    name: "damophus-red-gold",
    description: "Porcelain, judicial red, and restrained gold",
    cssVars: {
      light: {
        background: "oklch(0.985 0.006 85)", foreground: "oklch(0.21 0.02 28)",
        card: "oklch(1 0 0)", "card-foreground": "oklch(0.21 0.02 28)",
        popover: "oklch(1 0 0)", "popover-foreground": "oklch(0.21 0.02 28)",
        primary: "oklch(0.39 0.15 24)", "primary-foreground": "oklch(0.985 0.006 85)",
        secondary: "oklch(0.91 0.055 85)", "secondary-foreground": "oklch(0.3 0.07 55)",
        muted: "oklch(0.95 0.008 75)", "muted-foreground": "oklch(0.5 0.018 45)",
        accent: "oklch(0.88 0.08 82)", "accent-foreground": "oklch(0.3 0.07 55)",
        destructive: "oklch(0.56 0.21 27)", "destructive-foreground": "oklch(0.985 0.006 85)",
        border: "oklch(0.87 0.012 65)", input: "oklch(0.87 0.012 65)", ring: "oklch(0.54 0.14 29)",
        radius: "0.5rem",
      },
      dark: {
        background: "oklch(0.16 0.012 25)", foreground: "oklch(0.94 0.01 75)",
        card: "oklch(0.2 0.016 27)", "card-foreground": "oklch(0.94 0.01 75)",
        popover: "oklch(0.2 0.016 27)", "popover-foreground": "oklch(0.94 0.01 75)",
        primary: "oklch(0.7 0.15 28)", "primary-foreground": "oklch(0.15 0.012 25)",
        secondary: "oklch(0.45 0.08 80)", "secondary-foreground": "oklch(0.96 0.01 80)",
        muted: "oklch(0.25 0.014 30)", "muted-foreground": "oklch(0.71 0.018 65)",
        accent: "oklch(0.55 0.1 77)", "accent-foreground": "oklch(0.98 0.008 80)",
        destructive: "oklch(0.66 0.19 28)", "destructive-foreground": "oklch(0.98 0.008 80)",
        border: "oklch(0.31 0.018 35)", input: "oklch(0.31 0.018 35)", ring: "oklch(0.72 0.13 30)",
        radius: "0.5rem",
      },
    },
  },
  {
    name: "scholar-jade",
    description: "Cool paper, ink green, and cinnabar accents",
    cssVars: {
      light: {
        background: "oklch(0.98 0.008 155)", foreground: "oklch(0.2 0.025 165)",
        card: "oklch(0.995 0.003 150)", "card-foreground": "oklch(0.2 0.025 165)",
        popover: "oklch(0.995 0.003 150)", "popover-foreground": "oklch(0.2 0.025 165)",
        primary: "oklch(0.38 0.09 165)", "primary-foreground": "oklch(0.98 0.008 155)",
        secondary: "oklch(0.9 0.04 158)", "secondary-foreground": "oklch(0.28 0.06 165)",
        muted: "oklch(0.94 0.015 155)", "muted-foreground": "oklch(0.48 0.025 165)",
        accent: "oklch(0.66 0.16 36)", "accent-foreground": "oklch(0.98 0.008 155)",
        destructive: "oklch(0.56 0.21 27)", "destructive-foreground": "oklch(0.98 0.008 155)",
        border: "oklch(0.85 0.025 155)", input: "oklch(0.85 0.025 155)", ring: "oklch(0.49 0.1 165)",
        radius: "0.375rem",
      },
      dark: {
        background: "oklch(0.16 0.018 165)", foreground: "oklch(0.94 0.012 155)",
        card: "oklch(0.2 0.022 165)", "card-foreground": "oklch(0.94 0.012 155)",
        popover: "oklch(0.2 0.022 165)", "popover-foreground": "oklch(0.94 0.012 155)",
        primary: "oklch(0.7 0.1 160)", "primary-foreground": "oklch(0.15 0.018 165)",
        secondary: "oklch(0.31 0.05 160)", "secondary-foreground": "oklch(0.94 0.012 155)",
        muted: "oklch(0.25 0.02 165)", "muted-foreground": "oklch(0.7 0.025 155)",
        accent: "oklch(0.7 0.15 42)", "accent-foreground": "oklch(0.15 0.018 165)",
        destructive: "oklch(0.66 0.19 28)", "destructive-foreground": "oklch(0.98 0.008 155)",
        border: "oklch(0.31 0.025 165)", input: "oklch(0.31 0.025 165)", ring: "oklch(0.68 0.1 160)",
        radius: "0.375rem",
      },
    },
  },
  {
    name: "cobalt-amber",
    description: "Clear cobalt structure with warm amber emphasis",
    cssVars: {
      light: {
        background: "oklch(0.985 0.006 245)", foreground: "oklch(0.2 0.03 255)",
        card: "oklch(1 0 0)", "card-foreground": "oklch(0.2 0.03 255)",
        popover: "oklch(1 0 0)", "popover-foreground": "oklch(0.2 0.03 255)",
        primary: "oklch(0.42 0.15 255)", "primary-foreground": "oklch(0.985 0.006 245)",
        secondary: "oklch(0.9 0.04 245)", "secondary-foreground": "oklch(0.3 0.08 255)",
        muted: "oklch(0.94 0.012 245)", "muted-foreground": "oklch(0.49 0.025 255)",
        accent: "oklch(0.77 0.15 70)", "accent-foreground": "oklch(0.26 0.06 55)",
        destructive: "oklch(0.56 0.21 27)", "destructive-foreground": "oklch(0.985 0.006 245)",
        border: "oklch(0.85 0.025 245)", input: "oklch(0.85 0.025 245)", ring: "oklch(0.55 0.14 255)",
        radius: "0.5rem",
      },
      dark: {
        background: "oklch(0.16 0.02 255)", foreground: "oklch(0.94 0.01 245)",
        card: "oklch(0.2 0.025 255)", "card-foreground": "oklch(0.94 0.01 245)",
        popover: "oklch(0.2 0.025 255)", "popover-foreground": "oklch(0.94 0.01 245)",
        primary: "oklch(0.7 0.12 250)", "primary-foreground": "oklch(0.15 0.02 255)",
        secondary: "oklch(0.3 0.06 255)", "secondary-foreground": "oklch(0.94 0.01 245)",
        muted: "oklch(0.25 0.025 255)", "muted-foreground": "oklch(0.7 0.025 245)",
        accent: "oklch(0.78 0.14 72)", "accent-foreground": "oklch(0.18 0.025 55)",
        destructive: "oklch(0.66 0.19 28)", "destructive-foreground": "oklch(0.98 0.008 245)",
        border: "oklch(0.31 0.03 255)", input: "oklch(0.31 0.03 255)", ring: "oklch(0.69 0.12 250)",
        radius: "0.5rem",
      },
    },
  },
] as const;

export function themeId(theme: DamophusTheme, source: "builtin" | "custom"): string {
  return `${source}:${theme.name}`;
}

export function findTheme(id: string, customThemes: readonly DamophusTheme[]): DamophusTheme {
  const [source, ...nameParts] = id.split(":");
  const name = nameParts.join(":");
  const themes = source === "custom" ? customThemes : BUILTIN_THEMES;
  return themes.find((theme) => theme.name === name) ?? BUILTIN_THEMES[0];
}
