import { AttemptExportSchema } from "./schema";
import type { AttemptEvent } from "./types";

export interface AttemptArchive {
  schema_version: 1;
  exported_at: string;
  plugin_version: string;
  attempts: AttemptEvent[];
}

export function createAttemptArchive(
  attempts: readonly AttemptEvent[],
  pluginVersion: string,
  exportedAt = new Date().toISOString(),
): AttemptArchive {
  return AttemptExportSchema.parse({
    schema_version: 1,
    exported_at: exportedAt,
    plugin_version: pluginVersion,
    attempts,
  }) as AttemptArchive;
}

export function parseAttemptArchive(source: string | unknown): AttemptArchive {
  const value: unknown = typeof source === "string" ? JSON.parse(source) : source;
  return AttemptExportSchema.parse(value) as AttemptArchive;
}

export function serializeAttemptArchive(archive: AttemptArchive): string {
  return `${JSON.stringify(AttemptExportSchema.parse(archive), null, 2)}\n`;
}
