import { createConsola, LogLevels, type ConsolaInstance, type ConsolaReporter, type LogObject } from "consola";

export const DAMOPHUS_LOG_LEVELS = ["silent", "error", "warn", "info", "debug", "trace"] as const;
export type DamophusLogLevel = (typeof DAMOPHUS_LOG_LEVELS)[number];
export type DamophusLogger = ConsolaInstance;

export interface DamophusLogRecord {
  timestamp: string;
  level: Exclude<DamophusLogLevel, "silent">;
  scope: string;
  args: unknown[];
}

export const LOG_LEVEL_STORAGE_KEY = "damophus.log.level";
export const LOG_SCOPE_STORAGE_KEY = "damophus.log.scopes";
const RECORD_LIMIT = 500;

const records: DamophusLogRecord[] = [];
const loggers = new Map<string, ConsolaInstance>();
const scopeLevels = new Map<string, DamophusLogLevel>();
const recorder: ConsolaReporter = {
  log(logObject: LogObject) {
    const level = toLogLevel(logObject.type);
    if (level === "silent") return;
    const scope = normalizeScope((logObject.tag ?? "app").replace(/^damophus:/u, ""));
    records.push({
      timestamp: logObject.date.toISOString(),
      level,
      scope,
      args: [logObject.message, ...logObject.args].filter((value) => value !== undefined).map(serializeValue),
    });
    if (records.length > RECORD_LIMIT) records.splice(0, records.length - RECORD_LIMIT);
  },
};

const rootLogger = createConsola({ level: LogLevels.silent });
rootLogger.addReporter(recorder);
let currentLevel = resolveInitialLevel();
loadScopeLevels();
applyLevels();

interface DamophusLogController {
  getLevel(): DamophusLogLevel;
  setLevel(level: DamophusLogLevel): void;
  getScopeLevels(): Record<string, DamophusLogLevel>;
  setScopeLevel(scope: string, level?: DamophusLogLevel): void;
  getRecords(): DamophusLogRecord[];
  clear(): void;
  exportText(): string;
  write(scope: string, level: Exclude<DamophusLogLevel, "silent">, ...args: unknown[]): void;
  reset(): void;
}

declare global {
  interface Window {
    __damophusLog?: DamophusLogController;
  }
}

export function enableLogging(enabled: boolean): void {
  setLogLevel(enabled ? "debug" : "silent", { persist: false });
  if (enabled) {
    getLogger("logging").info("debug logging enabled", { level: getLogLevel() });
  }
}

export function isLoggingEnabled(): boolean {
  return currentLevel !== "silent" || scopeLevels.size > 0;
}

export function getLogLevel(): DamophusLogLevel {
  return currentLevel;
}

export function setLogLevel(level: DamophusLogLevel, options: { persist?: boolean } = {}): void {
  assertLogLevel(level);
  currentLevel = level;
  applyLevels();
  if (options.persist !== false) writeStorage(LOG_LEVEL_STORAGE_KEY, level);
}

export function setScopeLogLevel(scope: string, level?: DamophusLogLevel): void {
  const normalizedScope = normalizeScope(scope);
  if (level === undefined) scopeLevels.delete(normalizedScope);
  else {
    assertLogLevel(level);
    scopeLevels.set(normalizedScope, level);
  }
  applyLevels();
  persistScopeLevels();
}

export function getLogRecords(): DamophusLogRecord[] {
  return records.map((record) => ({ ...record, args: [...record.args] }));
}

export function clearLogRecords(): void {
  records.length = 0;
}

export function exportLogText(): string {
  return records.map((record) => (
    `${record.timestamp} ${record.level.toUpperCase()} [damophus:${record.scope}] ${record.args.map(formatValue).join(" ")}`
  )).join("\n");
}

export function getLogger(scope: string): DamophusLogger {
  const normalizedScope = normalizeScope(scope);
  const cached = loggers.get(normalizedScope);
  if (cached) return cached;
  const logger = rootLogger.withTag(`damophus:${normalizedScope}`);
  loggers.set(normalizedScope, logger);
  applyLevels();
  return logger;
}

function writeDiagnostic(scope: string, level: Exclude<DamophusLogLevel, "silent">, ...args: unknown[]): void {
  getLogger(scope)[level](...args);
}

function applyLevels(): void {
  rootLogger.level = LogLevels[currentLevel];
  for (const [scope, logger] of loggers) logger.level = LogLevels[scopeLevels.get(scope) ?? currentLevel];
}

function resolveInitialLevel(): DamophusLogLevel {
  if (typeof window === "undefined") return "silent";
  const query = new URLSearchParams(window.location.search).get("damophus-log")
    ?? new URLSearchParams(window.location.search).get("log");
  if (isLogLevel(query)) return query;
  const stored = readStorage(LOG_LEVEL_STORAGE_KEY);
  return isLogLevel(stored) ? stored : "silent";
}

function loadScopeLevels(): void {
  const stored = readStorage(LOG_SCOPE_STORAGE_KEY);
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    for (const [scope, level] of Object.entries(parsed)) {
      if (isLogLevel(level)) scopeLevels.set(normalizeScope(scope), level);
    }
  } catch {
    // Invalid diagnostics state must not prevent plugin startup.
  }
}

function persistScopeLevels(): void {
  writeStorage(LOG_SCOPE_STORAGE_KEY, JSON.stringify(Object.fromEntries(scopeLevels)));
}

function installLogController(): void {
  if (typeof window === "undefined") return;
  window.__damophusLog = {
    getLevel: getLogLevel,
    setLevel: (level) => setLogLevel(level),
    getScopeLevels: () => Object.fromEntries(scopeLevels),
    setScopeLevel: setScopeLogLevel,
    getRecords: getLogRecords,
    clear: clearLogRecords,
    exportText: exportLogText,
    write: writeDiagnostic,
    reset: () => {
      currentLevel = "silent";
      scopeLevels.clear();
      applyLevels();
      clearLogRecords();
      removeStorage(LOG_LEVEL_STORAGE_KEY);
      removeStorage(LOG_SCOPE_STORAGE_KEY);
    },
  };
}

function normalizeScope(scope: string): string {
  return scope.trim() || "app";
}

function assertLogLevel(level: unknown): asserts level is DamophusLogLevel {
  if (!isLogLevel(level)) throw new TypeError(`Unsupported Damophus log level: ${String(level)}`);
}

function isLogLevel(value: unknown): value is DamophusLogLevel {
  return typeof value === "string" && (DAMOPHUS_LOG_LEVELS as readonly string[]).includes(value);
}

function toLogLevel(type: string): Exclude<DamophusLogLevel, "silent"> | "silent" {
  return isLogLevel(type) ? (type === "silent" ? "silent" : type) : "info";
}

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, value); } catch { /* Restricted WebView. */ }
}

function removeStorage(key: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(key); } catch { /* Restricted WebView. */ }
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    const error = value as Error & { cause?: unknown };
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
      ...(error.cause === undefined ? {} : { cause: serializeValue(error.cause) }),
    };
  }
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : JSON.parse(json);
  } catch { return String(value); }
}

function formatValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

installLogController();
