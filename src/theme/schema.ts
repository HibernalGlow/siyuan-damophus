import { z } from "zod";

export const MAX_THEME_FILE_BYTES = 1024 * 1024;
export const MAX_THEME_COUNT = 64;

export const TWEAKCN_VARIABLE_NAMES = [
  "accent",
  "accent-foreground",
  "background",
  "border",
  "card",
  "card-foreground",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "destructive",
  "destructive-foreground",
  "font-mono",
  "font-sans",
  "font-serif",
  "foreground",
  "input",
  "letter-spacing",
  "muted",
  "muted-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "radius",
  "ring",
  "secondary",
  "secondary-foreground",
  "shadow",
  "shadow-2xl",
  "shadow-2xs",
  "shadow-blur",
  "shadow-color",
  "shadow-lg",
  "shadow-md",
  "shadow-offset-x",
  "shadow-offset-y",
  "shadow-opacity",
  "shadow-sm",
  "shadow-spread",
  "shadow-xl",
  "shadow-xs",
  "sidebar",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-ring",
  "spacing",
  "tracking-normal",
  "tracking-tight",
  "tracking-tighter",
  "tracking-wide",
  "tracking-wider",
  "tracking-widest",
] as const;

export type TweakcnVariableName = typeof TWEAKCN_VARIABLE_NAMES[number];
export type ThemeVariables = Partial<Record<TweakcnVariableName, string>>;

export interface DamophusTheme {
  name: string;
  description?: string;
  cssVars: {
    light: ThemeVariables;
    dark: ThemeVariables;
  };
}

export interface ThemeImportIssue {
  index?: number;
  name?: string;
  message: string;
}

export interface ThemeImportReport {
  themes: DamophusTheme[];
  errors: ThemeImportIssue[];
  skipped: ThemeImportIssue[];
}

const REQUIRED_VARIABLE_NAMES: readonly TweakcnVariableName[] = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "primary",
  "primary-foreground",
  "border",
  "input",
  "ring",
];
const VARIABLE_NAME_SET = new Set<string>(TWEAKCN_VARIABLE_NAMES);
const FORBIDDEN_VALUE_PATTERN = /(?:url\s*\(|@import|content\s*:|attr\s*\(|expression\s*\(|javascript:|[{};<>&]|[\u0000-\u001f\u007f])/iu;

const rawThemeSchema = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(240).optional(),
  cssVars: z.object({
    light: z.record(z.string(), z.string()),
    dark: z.record(z.string(), z.string()),
  }).strict(),
}).strict();

function validateThemeName(name: string): string | undefined {
  if (/[:/\\<>\u0000-\u001f\u007f]/u.test(name)) {
    return "Theme name contains a reserved character";
  }
  return undefined;
}

function normalizeVariables(
  branch: "light" | "dark",
  values: Record<string, string>,
): { variables?: ThemeVariables; error?: string } {
  const variables: ThemeVariables = {};
  for (const [name, rawValue] of Object.entries(values)) {
    if (!VARIABLE_NAME_SET.has(name)) return { error: `${branch}.${name} is not allowed` };
    const value = rawValue.trim();
    if (!value || value.length > 256 || FORBIDDEN_VALUE_PATTERN.test(value)) {
      return { error: `${branch}.${name} contains an unsafe or unsupported value` };
    }
    variables[name as TweakcnVariableName] = value;
  }
  const missing = REQUIRED_VARIABLE_NAMES.filter((name) => !variables[name]);
  if (missing.length > 0) return { error: `${branch} is missing: ${missing.join(", ")}` };
  return { variables };
}

export function importThemesJson(json: string): ThemeImportReport {
  const report: ThemeImportReport = { themes: [], errors: [], skipped: [] };
  if (new TextEncoder().encode(json).byteLength > MAX_THEME_FILE_BYTES) {
    report.errors.push({ message: `Theme file exceeds ${MAX_THEME_FILE_BYTES} bytes` });
    return report;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    report.errors.push({ message: "Theme file is not valid UTF-8 JSON" });
    return report;
  }

  const candidates = Array.isArray(parsed) ? parsed : [parsed];
  if (candidates.length > MAX_THEME_COUNT) {
    report.errors.push({ message: `Theme file contains more than ${MAX_THEME_COUNT} themes` });
    return report;
  }

  const seen = new Set<string>();
  candidates.forEach((candidate, index) => {
    const result = rawThemeSchema.safeParse(candidate);
    if (!result.success) {
      report.errors.push({ index, message: result.error.issues.map((issue) => issue.message).join("; ") });
      return;
    }
    const { name, description, cssVars } = result.data;
    const nameError = validateThemeName(name);
    if (nameError) {
      report.errors.push({ index, name, message: nameError });
      return;
    }
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) {
      report.skipped.push({ index, name, message: "Duplicate theme name in the same file" });
      return;
    }
    const light = normalizeVariables("light", cssVars.light);
    const dark = normalizeVariables("dark", cssVars.dark);
    if (!light.variables || !dark.variables) {
      report.errors.push({ index, name, message: light.error ?? dark.error ?? "Invalid theme variables" });
      return;
    }
    seen.add(key);
    report.themes.push({ name, description, cssVars: { light: light.variables, dark: dark.variables } });
  });
  return report;
}

export function parseStoredThemes(value: unknown): DamophusTheme[] {
  if (!Array.isArray(value)) return [];
  const report = importThemesJson(JSON.stringify(value));
  return report.themes;
}
