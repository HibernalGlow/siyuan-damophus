export type HistoryOperation = "update" | "format" | "sync" | "replace" | "outline" | string;

export interface HistoryVersion {
  created: string;
  title?: string;
  path?: string;
  operation?: HistoryOperation;
}
