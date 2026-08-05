import {
  reconcilePracticeSession,
  type PracticeSessionRecoveryIssue,
} from "../core/session-recovery";
import type { PracticeSessionSnapshot } from "../core/session-schema";
import type { AttemptEvent, Question } from "../core/types";

export type PracticeSessionLifecycleErrorCode =
  | "session-in-use"
  | "session-has-no-questions"
  | "replacement-source-mismatch";

export class PracticeSessionLifecycleError extends Error {
  constructor(readonly code: PracticeSessionLifecycleErrorCode, message: string) {
    super(message);
    this.name = "PracticeSessionLifecycleError";
  }
}

export interface PracticeSessionLifecycleHost {
  acquirePracticeSession(sourceKey: string): Promise<boolean>;
  releasePracticeSession(sourceKey: string): Promise<void>;
  removePracticeSession(sourceKey: string, sessionId?: string): Promise<void>;
  loadSessionAttempts(sessionId: string): Promise<AttemptEvent[]>;
}

export interface PracticeSessionActivation {
  snapshot: PracticeSessionSnapshot;
  attempts: ReadonlyMap<string, AttemptEvent>;
  persistedRevision: number;
  recoveryIssues: PracticeSessionRecoveryIssue[];
}

export type ActivatePracticeSession = (activation: PracticeSessionActivation) => Promise<void>;

async function withPracticeSessionLease(
  host: PracticeSessionLifecycleHost,
  sourceKey: string,
  operation: () => Promise<void>,
): Promise<void> {
  if (!await host.acquirePracticeSession(sourceKey)) {
    throw new PracticeSessionLifecycleError(
      "session-in-use",
      "This practice session is open in another window",
    );
  }
  let transferred = false;
  try {
    await operation();
    transferred = true;
  } finally {
    if (!transferred) await host.releasePracticeSession(sourceKey);
  }
}

export async function startPracticeSession(input: {
  host: PracticeSessionLifecycleHost;
  sourceKey: string;
  createSnapshot: () => PracticeSessionSnapshot;
  activate: ActivatePracticeSession;
}): Promise<void> {
  await withPracticeSessionLease(input.host, input.sourceKey, async () => {
    await input.activate({
      snapshot: input.createSnapshot(),
      attempts: new Map(),
      persistedRevision: -1,
      recoveryIssues: [],
    });
  });
}

export async function resumePracticeSession(input: {
  host: PracticeSessionLifecycleHost;
  snapshot: PracticeSessionSnapshot;
  questions: readonly Question[];
  now?: Date;
  activate: ActivatePracticeSession;
}): Promise<void> {
  await withPracticeSessionLease(input.host, input.snapshot.source_key, async () => {
    const attempts = await input.host.loadSessionAttempts(input.snapshot.session_id);
    const recovery = reconcilePracticeSession(input.snapshot, input.questions, attempts, input.now);
    if (!recovery.snapshot) {
      throw new PracticeSessionLifecycleError(
        "session-has-no-questions",
        "None of this session's questions still exist",
      );
    }
    await input.activate({
      snapshot: recovery.snapshot,
      attempts: recovery.attemptsByQuestionId,
      persistedRevision: input.snapshot.revision,
      recoveryIssues: recovery.issues,
    });
  });
}

export async function replacePracticeSession(input: {
  host: PracticeSessionLifecycleHost;
  previous: PracticeSessionSnapshot;
  createSnapshot: () => PracticeSessionSnapshot;
  activate: ActivatePracticeSession;
}): Promise<void> {
  await withPracticeSessionLease(input.host, input.previous.source_key, async () => {
    const replacement = input.createSnapshot();
    if (replacement.source_key !== input.previous.source_key) {
      throw new PracticeSessionLifecycleError(
        "replacement-source-mismatch",
        "A replacement practice session must use the same source",
      );
    }
    await input.host.removePracticeSession(input.previous.source_key, input.previous.session_id);
    await input.activate({
      snapshot: replacement,
      attempts: new Map(),
      persistedRevision: -1,
      recoveryIssues: [],
    });
  });
}
