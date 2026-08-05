import { describe, expect, it } from "vitest";
import { applyThemeVariables } from "./runtime";
import { BUILTIN_THEMES } from "./themes";

function themeElement() {
  const variables = new Map<string, string>();
  const classes = new Set<string>();
  return {
    dataset: {} as DOMStringMap,
    classList: {
      toggle(name: string, force?: boolean) {
        if (force) classes.add(name);
        else classes.delete(name);
        return Boolean(force);
      },
    },
    style: {
      removeProperty(name: string) {
        variables.delete(name);
        return "";
      },
      setProperty(name: string, value: string) {
        variables.set(name, value);
      },
    },
    variables,
    classes,
  };
}

describe("theme runtime", () => {
  it("applies the selected color branch and synchronizes dark variants", () => {
    const element = themeElement();

    applyThemeVariables(element as unknown as HTMLElement, BUILTIN_THEMES[0], "dark");

    expect(element.dataset.colorMode).toBe("dark");
    expect(element.classes.has("dark")).toBe(true);
    expect(element.variables.get("--background")).toBe(BUILTIN_THEMES[0].cssVars.dark.background);
    expect(element.variables.has("--font-sans")).toBe(false);

    applyThemeVariables(element as unknown as HTMLElement, BUILTIN_THEMES[0], "light");
    expect(element.classes.has("dark")).toBe(false);
    expect(element.variables.get("--background")).toBe(BUILTIN_THEMES[0].cssVars.light.background);
  });
});
