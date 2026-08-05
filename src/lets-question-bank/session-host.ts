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

function parseFile(value: unknown): SessionFile {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return { schema_version: 1, sessions: {} };
    }
  }
  if (!parsed || typeof parsed !== "object") return { schema_version: 1, sessions: {} };
  const sessions = (parsed as { sessions?: unknown }).sessions;
  return {
    schema_version: 1,
    sessions: sessions && typeof sessions === "object"
      ? { ...(sessions as Record<string, unknown>) }
      : {},
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

interface HeldLease {
  channel: BroadcastChannel;
  elector: LeaderElector;
}

export class BroadcastPracticeSessionLeaseCoordinator implements PracticeSessionLeaseCoordinator {
  private readonly held = new Map<string, HeldLease>();

  async acquire(sourceKey: string): Promise<boolean> {
    if (this.held.has(sourceKey)) return true;
    const channel = new BroadcastChannel(`damophus-practice-${encodeURIComponent(sourceKey)}`);
    const elector = createLeaderElection(channel, { fallbackInterval: 500, responseTime: 120 });
    const acquired = await elector.applyOnce();
    if (!acquired || !elector.isLeader) {
      await elector.die();
      await channel.close();
      return false;
    }
    this.held.set(sourceKey, { channel, elector });
    return true;
  }

  async release(sourceKey: string): Promise<void> {
    const lease = this.held.get(sourceKey);
    if (!lease) return;
    this.held.delete(sourceKey);
    await lease.elector.die();
    await lease.channel.close();
  }

  async releaseAll(): Promise<void> {
    await Promise.all([...this.held.keys()].map((sourceKey) => this.release(sourceKey)));
  }
}
