import type { DamophusTheme } from "./schema";

export interface MergeThemesResult {
  themes: DamophusTheme[];
  added: string[];
  replaced: string[];
}

export function mergeCustomThemes(
  current: readonly DamophusTheme[],
  incoming: readonly DamophusTheme[],
): MergeThemesResult {
  const themes = [...current];
  const added: string[] = [];
  const replaced: string[] = [];
  for (const theme of incoming) {
    const index = themes.findIndex((candidate) => (
      candidate.name.toLocaleLowerCase() === theme.name.toLocaleLowerCase()
    ));
    if (index >= 0) {
      themes[index] = theme;
      replaced.push(theme.name);
    } else {
      themes.push(theme);
      added.push(theme.name);
    }
  }
  return { themes, added, replaced };
}

export function removeCustomTheme(
  themes: readonly DamophusTheme[],
  name: string,
): DamophusTheme[] {
  return themes.filter((theme) => theme.name !== name);
}

export function exportCustomThemes(themes: readonly DamophusTheme[]): string {
  return JSON.stringify(themes, null, 2);
}
