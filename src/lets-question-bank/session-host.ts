import { BroadcastChannel, createLeaderElection, type LeaderElector } from "broadcast-channel";
import {
  parsePracticeSessionSnapshot,
  type PracticeSessionSnapshot,
  type PracticeSessionSnapshotParseResult,
} from "../question-bank/core/session-schema";

const sessionStorageName = "damophus-practice-sessions";

interface SessionFile {
  schema_version: 1;
  sessions: Record<string, unknown>;
}

export interface PluginDataApi {
  loadData(storageName: string): Promise<unknown>;
  saveData(storageName: string, content: unknown): Promise<unknown>;
}

export interface StoredPracticeSession {
  sourceKey: string;
  result: PracticeSessionSnapshotParseResult;
}

export interface PracticeSessionRepository {
  list(): Promise<StoredPracticeSession[]>;
  load(sourceKey: string): Promise<PracticeSessionSnapshotParseResult | undefined>;
  save(snapshot: PracticeSessionSnapshot, expectedRevision?: number): Promise<void>;
  remove(sourceKey: string, sessionId?: string): Promise<void>;
  diagnostic(sourceKey: string): Promise<string>;
}

export class PracticeSessionConflictError extends Error {
  constructor(message = "Practice session changed in another window") {
    super(message);
    this.name = "PracticeSessionConflictError";
  }
}

export class PracticeSessionStorageError extends Error {
  constructor(message = "Practice session storage is invalid") {
    super(message);
    this.name = "PracticeSessionStorageError";
  }
}

function parseFile(value: unknown): SessionFile {
  if (value === undefined || value === null || value === "") {
    return { schema_version: 1, sessions: {} };
  }
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw new PracticeSessionStorageError("Practice session storage contains invalid JSON");
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PracticeSessionStorageError();
  }
  const root = parsed as { schema_version?: unknown; sessions?: unknown };
  if (root.schema_version !== 1) {
    throw new PracticeSessionStorageError("Practice session storage version is unsupported");
  }
  if (!root.sessions || typeof root.sessions !== "object" || Array.isArray(root.sessions)) {
    throw new PracticeSessionStorageError("Practice session storage has an invalid sessions index");
  }
  return {
    schema_version: 1,
    sessions: { ...(root.sessions as Record<string, unknown>) },
  };
}

export class SiyuanPracticeSessionRepository implements PracticeSessionRepository {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly data: PluginDataApi) {}

  private async read(): Promise<SessionFile> {
    return parseFile(await this.data.loadData(sessionStorageName));
  }

  private async write(file: SessionFile): Promise<void> {
    await this.data.saveData(sessionStorageName, file);
  }

  private async exclusiveWrite<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.writeChain;
    let release!: () => void;
    this.writeChain = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const locks = globalThis.navigator?.locks;
      return locks
        ? await locks.request(`${sessionStorageName}-write`, operation)
        : await operation();
    } finally {
      release();
    }
  }

  async list(): Promise<StoredPracticeSession[]> {
    const file = await this.read();
    return Object.entries(file.sessions).map(([sourceKey, value]) => ({
      sourceKey,
      result: parsePracticeSessionSnapshot(value),
    }));
  }

  async load(sourceKey: string): Promise<PracticeSessionSnapshotParseResult | undefined> {
    const file = await this.read();
    return sourceKey in file.sessions
      ? parsePracticeSessionSnapshot(file.sessions[sourceKey])
      : undefined;
  }

  async save(snapshot: PracticeSessionSnapshot, expectedRevision?: number): Promise<void> {
    await this.exclusiveWrite(async () => {
      const file = await this.read();
      const currentRaw = file.sessions[snapshot.source_key];
      const current = currentRaw === undefined ? undefined : parsePracticeSessionSnapshot(currentRaw);
      if (current && current.status !== "ok") {
        throw new PracticeSessionConflictError("Stored practice session cannot be safely replaced");
      }
      if (expectedRevision === undefined) {
        if (current?.status === "ok" && current.snapshot.session_id !== snapshot.session_id) {
          throw new PracticeSessionConflictError();
        }
      } else if (current?.status !== "ok" || current.snapshot.revision !== expectedRevision) {
        throw new PracticeSessionConflictError();
      }
      file.sessions[snapshot.source_key] = snapshot;
      await this.write(file);
    });
  }

  async remove(sourceKey: string, sessionId?: string): Promise<void> {
    await this.exclusiveWrite(async () => {
      const file = await this.read();
      if (!(sourceKey in file.sessions)) return;
      const current = parsePracticeSessionSnapshot(file.sessions[sourceKey]);
      if (sessionId && current.status === "ok" && current.snapshot.session_id !== sessionId) {
        throw new PracticeSessionConflictError();
      }
      delete file.sessions[sourceKey];
      await this.write(file);
    });
  }

  async diagnostic(sourceKey: string): Promise<string> {
    const file = await this.read();
    return JSON.stringify({ sourceKey, snapshot: file.sessions[sourceKey] }, null, 2);
  }
}

export interface PracticeSessionLeaseCoordinator {
  acquire(sourceKey: string): Promise<boolean>;
  release(sourceKey: string): Promise<void>;
  releaseAll(): Promise<void>;
}

interface BroadcastHeldLease {
  kind: "broadcast";
  channel: BroadcastChannel;
  elector: LeaderElector;
}

interface WebLockHeldLease {
  kind: "web-lock";
  release: () => void;
  done: Promise<void>;
}

type HeldLease = BroadcastHeldLease | WebLockHeldLease;

export class BroadcastPracticeSessionLeaseCoordinator implements PracticeSessionLeaseCoordinator {
  private readonly held = new Map<string, HeldLease>();

  async acquire(sourceKey: string): Promise<boolean> {
    if (this.held.has(sourceKey)) return true;
    const lockName = `damophus-practice-${encodeURIComponent(sourceKey)}`;
    const locks = globalThis.navigator?.locks;
    if (locks) {
      let release!: () => void;
      const hold = new Promise<void>((resolve) => { release = resolve; });
      let reportAvailability!: (available: boolean) => void;
      const availability = new Promise<boolean>((resolve) => { reportAvailability = resolve; });
      const done = locks.request(
        lockName,
        { mode: "exclusive", ifAvailable: true },
        async (lock) => {
          reportAvailability(Boolean(lock));
          if (lock) await hold;
        },
      );
      const acquired = await availability;
      if (!acquired) {
        await done;
        return false;
      }
      this.held.set(sourceKey, { kind: "web-lock", release, done });
      return true;
    }

    const channel = new BroadcastChannel(lockName);
    const elector = createLeaderElection(channel, { fallbackInterval: 500, responseTime: 120 });
    const acquired = await elector.applyOnce();
    if (!acquired || !elector.isLeader) {
      await elector.die();
      await channel.close();
      return false;
    }
    this.held.set(sourceKey, { kind: "broadcast", channel, elector });
    return true;
  }

  async release(sourceKey: string): Promise<void> {
    const lease = this.held.get(sourceKey);
    if (!lease) return;
    this.held.delete(sourceKey);
    if (lease.kind === "web-lock") {
      lease.release();
      await lease.done;
      return;
    }
    await lease.elector.die();
    await lease.channel.close();
  }

  async releaseAll(): Promise<void> {
    await Promise.all([...this.held.keys()].map((sourceKey) => this.release(sourceKey)));
  }
}
