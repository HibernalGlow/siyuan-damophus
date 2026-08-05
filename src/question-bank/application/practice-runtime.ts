import { createActor, type ActorRefFrom, type Subscription } from "xstate";
import {
  practiceSessionMachine,
  type PracticeSessionMachineInput,
} from "../core/session-machine";
import type { PracticeSessionSnapshot } from "../core/session-schema";

export type PracticeSessionActor = ActorRefFrom<typeof practiceSessionMachine>;
export type PracticeSessionActorSnapshot = ReturnType<PracticeSessionActor["getSnapshot"]>;
export type PracticeSessionSaveStatus = "saved" | "saving" | "error";

export interface PracticeSessionRuntimeHost {
  savePracticeSession(snapshot: PracticeSessionSnapshot, expectedRevision?: number): Promise<void>;
  removePracticeSession(sourceKey: string, sessionId?: string): Promise<void>;
  releasePracticeSession(sourceKey: string): Promise<void>;
}

export interface PracticeSessionRuntimeOptions {
  host: PracticeSessionRuntimeHost;
  input: PracticeSessionMachineInput;
  persistedRevision: number;
  autosaveDelayMs?: number;
}

export class PracticeSessionRuntime {
  readonly actor: PracticeSessionActor;
  private readonly host: PracticeSessionRuntimeHost;
  private readonly autosaveDelayMs: number;
  private actorSubscription?: Subscription;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private drainPromise?: Promise<void>;
  private pending?: PracticeSessionSnapshot;
  private persistedRevision: number;
  private status: PracticeSessionSaveStatus = "saved";
  private saveError?: Error;
  private readonly stateListeners = new Set<(snapshot: PracticeSessionActorSnapshot) => void>();
  private readonly statusListeners = new Set<(status: PracticeSessionSaveStatus, error?: Error) => void>();

  constructor(options: PracticeSessionRuntimeOptions) {
    this.host = options.host;
    this.persistedRevision = options.persistedRevision;
    this.autosaveDelayMs = options.autosaveDelayMs ?? 120;
    this.actor = createActor(practiceSessionMachine, { input: options.input });
    this.actorSubscription = this.actor.subscribe((snapshot) => {
      for (const listener of this.stateListeners) listener(snapshot);
      if (!snapshot.matches("completed") && !snapshot.matches("ended")) {
        this.schedule(snapshot.context.session);
      }
    });
    this.actor.start();
  }

  get saveStatus(): PracticeSessionSaveStatus {
    return this.status;
  }

  get lastSaveError(): Error | undefined {
    return this.saveError;
  }

  subscribeState(listener: (snapshot: PracticeSessionActorSnapshot) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.actor.getSnapshot());
    return () => this.stateListeners.delete(listener);
  }

  subscribeSaveStatus(
    listener: (status: PracticeSessionSaveStatus, error?: Error) => void,
  ): () => void {
    this.statusListeners.add(listener);
    listener(this.status, this.saveError);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: PracticeSessionSaveStatus, error?: Error): void {
    this.status = status;
    this.saveError = error;
    for (const listener of this.statusListeners) listener(status, error);
  }

  private schedule(snapshot: PracticeSessionSnapshot): void {
    if (snapshot.revision <= this.persistedRevision) return;
    if (!this.pending || snapshot.revision >= this.pending.revision) this.pending = snapshot;
    if (this.saveTimer || this.drainPromise) return;
    this.setStatus("saving");
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      void this.drain().catch(() => undefined);
    }, this.autosaveDelayMs);
  }

  private async drain(): Promise<void> {
    if (this.drainPromise) return this.drainPromise;
    this.drainPromise = (async () => {
      while (this.pending) {
        const next = this.pending;
        this.pending = undefined;
        try {
          await this.host.savePracticeSession(
            next,
            this.persistedRevision >= 0 ? this.persistedRevision : undefined,
          );
          this.persistedRevision = next.revision;
        } catch (reason) {
          if (!this.pending || next.revision >= this.pending.revision) this.pending = next;
          const error = reason instanceof Error ? reason : new Error(String(reason));
          this.setStatus("error", error);
          throw error;
        }
      }
      this.setStatus("saved");
    })().finally(() => {
      this.drainPromise = undefined;
    });
    return this.drainPromise;
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    if (this.drainPromise) await this.drainPromise;
    if (this.pending) await this.drain();
  }

  async retrySave(): Promise<void> {
    this.setStatus("saving");
    await this.flush();
  }

  async pause(now = Date.now()): Promise<void> {
    this.actor.send({ type: "PAUSE", now });
    try {
      await this.flush();
      await this.host.releasePracticeSession(this.actor.getSnapshot().context.session.source_key);
    } catch (error) {
      this.actor.send({ type: "RESUME", now: Date.now() });
      throw error;
    }
  }

  async end(now = Date.now()): Promise<void> {
    this.actor.send({ type: "END", now });
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.pending = undefined;
    if (this.drainPromise) await this.drainPromise.catch(() => undefined);
    const session = this.actor.getSnapshot().context.session;
    await this.host.removePracticeSession(session.source_key, session.session_id);
    await this.host.releasePracticeSession(session.source_key);
  }

  async complete(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.pending = undefined;
    if (this.drainPromise) await this.drainPromise.catch(() => undefined);
    const session = this.actor.getSnapshot().context.session;
    await this.host.removePracticeSession(session.source_key, session.session_id);
    await this.host.releasePracticeSession(session.source_key);
  }

  async dispose(): Promise<void> {
    const snapshot = this.actor.getSnapshot();
    if (snapshot.matches("active")) {
      this.actor.send({ type: "PAUSE", now: Date.now() });
      await this.flush().catch(() => undefined);
    } else if (snapshot.matches("submitting")) {
      await this.flush().catch(() => undefined);
    }
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.pending = undefined;
    await this.host.releasePracticeSession(snapshot.context.session.source_key).catch(() => undefined);
    this.actorSubscription?.unsubscribe();
    this.actorSubscription = undefined;
    this.actor.stop();
  }
}
