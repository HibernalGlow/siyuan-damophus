export type SkillSyncLogLevel = "info" | "success" | "error";

export interface SkillSyncLogEvent {
  level: SkillSyncLogLevel;
  stage: "inspect" | "plan" | "copy" | "apply" | "verify" | "complete";
  message: string;
  detail?: string;
}

export type SkillSyncReporter = (event: SkillSyncLogEvent) => void;

export function reportSkillSync(reporter: SkillSyncReporter | undefined, event: SkillSyncLogEvent): void {
  reporter?.(event);
}
