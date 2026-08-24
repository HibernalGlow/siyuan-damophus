import { decode } from "@msgpack/msgpack";
import { readDir } from "@/api";
import JSZip from "jszip";

export const RIFF_REVIEW_LOG_DIR = "/data/storage/riff/logs";
export const REVLOG_CSV_HEADERS = [
  "card_id",
  "review_time",
  "review_rating",
  "review_state",
  "review_duration",
] as const;

export interface RiffReviewLogEntry {
  id: string;
  cardId: string;
  rating: number;
  scheduledDays: number;
  elapsedDays: number;
  reviewed: number;
  state: number;
}

export interface ReviewLogFile {
  name: string;
  month: string;
}

export interface ReviewLogArchive {
  files: ReviewLogFile[];
  entries: RiffReviewLogEntry[];
  entriesByMonth: Map<string, RiffReviewLogEntry[]>;
  duplicateCount: number;
  errors: Array<{ file: string; message: string }>;
  firstReviewedAt?: number;
  lastReviewedAt?: number;
}

export interface ReviewLogReader {
  listFiles(): Promise<ReviewLogFile[]>;
  readFile(file: ReviewLogFile): Promise<Uint8Array>;
}

function numeric(value: unknown, field: string): number {
  const result = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`Unsupported ${field} value`);
  return result;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Missing ${field}`);
  return value;
}

export function decodeReviewLog(bytes: Uint8Array): RiffReviewLogEntry[] {
  const decoded = decode(bytes, { useBigInt64: true });
  if (!Array.isArray(decoded)) throw new Error("The Riff log root is not an array");
  return decoded.map((value, index) => {
    if (!value || typeof value !== "object") throw new Error(`Invalid Riff log entry at index ${index}`);
    const entry = value as Record<string, unknown>;
    return {
      id: text(entry.ID, "ID"),
      cardId: text(entry.CardID, "CardID"),
      rating: numeric(entry.Rating, "Rating"),
      scheduledDays: numeric(entry.ScheduledDays, "ScheduledDays"),
      elapsedDays: numeric(entry.ElapsedDays, "ElapsedDays"),
      reviewed: numeric(entry.Reviewed, "Reviewed"),
      state: numeric(entry.State, "State"),
    };
  });
}

function csvCell(value: string | number): string {
  const textValue = String(value);
  return /[",\r\n]/u.test(textValue) ? `"${textValue.replace(/"/gu, '""')}"` : textValue;
}

export function reviewLogToCsv(entries: readonly RiffReviewLogEntry[]): string {
  const rows = entries.map((entry) => [
    entry.cardId,
    entry.reviewed * 1000,
    entry.rating,
    entry.state,
    0,
  ].map(csvCell).join(","));
  return `${REVLOG_CSV_HEADERS.join(",")}\n${rows.join("\n")}${rows.length ? "\n" : ""}`;
}

export async function loadReviewLogArchive(reader: ReviewLogReader): Promise<ReviewLogArchive> {
  const files = await reader.listFiles();
  const entriesByMonth = new Map<string, RiffReviewLogEntry[]>();
  const errors: ReviewLogArchive["errors"] = [];
  const unique = new Map<string, RiffReviewLogEntry>();
  let duplicateCount = 0;

  for (const file of files) {
    try {
      const entries = decodeReviewLog(await reader.readFile(file));
      const monthEntries: RiffReviewLogEntry[] = [];
      for (const entry of entries) {
        if (unique.has(entry.id)) duplicateCount += 1;
        else {
          unique.set(entry.id, entry);
          monthEntries.push(entry);
        }
      }
      entriesByMonth.set(file.month, monthEntries);
    } catch (error) {
      errors.push({ file: file.name, message: error instanceof Error ? error.message : String(error) });
    }
  }

  const entries = [...unique.values()].sort((left, right) => left.reviewed - right.reviewed || left.id.localeCompare(right.id));
  return {
    files,
    entries,
    entriesByMonth,
    duplicateCount,
    errors,
    firstReviewedAt: entries[0]?.reviewed ? entries[0].reviewed * 1000 : undefined,
    lastReviewedAt: entries.at(-1)?.reviewed ? entries.at(-1)!.reviewed * 1000 : undefined,
  };
}

export async function monthlyReviewLogZip(archive: ReviewLogArchive): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const file of archive.files) {
    const entries = archive.entriesByMonth.get(file.month);
    if (entries) zip.file(`${file.month}.csv`, reviewLogToCsv(entries));
  }
  zip.file("revlog.csv", reviewLogToCsv(archive.entries));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export function createSiyuanReviewLogReader(): ReviewLogReader {
  return {
    async listFiles() {
      const entries = await readDir(RIFF_REVIEW_LOG_DIR);
      return entries
        .filter((entry) => !entry.isDir && /^\d{6}\.msgpack$/u.test(entry.name))
        .map((entry) => ({ name: entry.name, month: entry.name.slice(0, 6) }))
        .sort((left, right) => left.month.localeCompare(right.month));
    },
    async readFile(file) {
      const response = await fetch("/api/file/getFile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: `${RIFF_REVIEW_LOG_DIR}/${file.name}` }),
      });
      if (response.status !== 200) throw new Error(`SiYuan file API returned HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

export function downloadReviewLog(content: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
