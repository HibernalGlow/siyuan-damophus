import { describe, expect, it } from "vitest";
import { importThemesJson } from "./schema";

function theme(overrides: Record<string, unknown> = {}) {
  const branch = {
    background: "oklch(0.98 0.01 90)",
    foreground: "oklch(0.2 0.02 20)",
    card: "oklch(1 0 0)",
    "card-foreground": "oklch(0.2 0.02 20)",
    primary: "oklch(0.42 0.16 24)",
    "primary-foreground": "oklch(0.98 0.01 90)",
    border: "oklch(0.85 0.01 90)",
    input: "oklch(0.85 0.01 90)",
    ring: "oklch(0.5 0.12 24)",
  };
  return { name: "reference-theme", cssVars: { light: branch, dark: branch }, ...overrides };
}

describe("tweakcn theme import", () => {
  it("accepts a single theme and a theme array", () => {
    expect(importThemesJson(JSON.stringify(theme())).themes).toHaveLength(1);
    expect(importThemesJson(JSON.stringify([theme(), theme({ name: "second" })])).themes).toHaveLength(2);
  });

  it("keeps valid themes when another entry fails", () => {
    const report = importThemesJson(JSON.stringify([
      theme(),
      theme({ name: "unsafe", cssVars: { light: {}, dark: {} } }),
    ]));
    expect(report.themes.map((item) => item.name)).toEqual(["reference-theme"]);
    expect(report.errors).toHaveLength(1);
  });

  it("rejects unknown variables and CSS injection values", () => {
    const unknown = theme();
    (unknown.cssVars.light as Record<string, string>).unknown = "red";
    expect(importThemesJson(JSON.stringify(unknown)).errors[0]?.message).toContain("not allowed");

    const injected = theme();
    injected.cssVars.dark.primary = "url(https://example.com/a.png)";
    expect(importThemesJson(JSON.stringify(injected)).errors[0]?.message).toContain("unsafe");
  });

  it("skips duplicate names without discarding the first theme", () => {
    const report = importThemesJson(JSON.stringify([theme(), theme()]));
    expect(report.themes).toHaveLength(1);
    expect(report.skipped).toHaveLength(1);
  });
});
