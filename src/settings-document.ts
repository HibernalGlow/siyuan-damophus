export type SettingsDocument = Record<string, unknown>;

export function parseSettingsDocument(value: unknown): SettingsDocument | undefined {
  if (value === undefined || value === null || value === "") return undefined;

  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : "";
      throw new Error(`Damophus settings contain invalid JSON${detail}`);
    }
  }

  if (!isSettingsDocument(parsed)) {
    throw new TypeError("Damophus settings must be a JSON object");
  }
  return cloneDocument(parsed);
}

export function mergeSettingsDocuments(
  defaults: SettingsDocument,
  stored: SettingsDocument,
): SettingsDocument {
  const merged = cloneDocument(defaults);
  for (const [key, value] of Object.entries(stored)) {
    const defaultValue = merged[key];
    merged[key] = isSettingsDocument(defaultValue) && isSettingsDocument(value)
      ? mergeSettingsDocuments(defaultValue, value)
      : cloneValue(value);
  }
  return merged;
}

export function isSettingsDocument(value: unknown): value is SettingsDocument {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneDocument(document: SettingsDocument): SettingsDocument {
  return Object.fromEntries(Object.entries(document).map(([key, value]) => [key, cloneValue(value)]));
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isSettingsDocument(value)) return cloneDocument(value);
  return value;
}
