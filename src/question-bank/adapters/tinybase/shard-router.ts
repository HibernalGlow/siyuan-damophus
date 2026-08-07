import { z } from "zod";

export const EventShardSchema = z.string().regex(/^\d{4}(?:-\d{2})?$/);
export const ANNUAL_SHARD_WARN_BYTES = 25 * 1024 * 1024;
export const ANNUAL_SHARD_LIMIT_BYTES = 50 * 1024 * 1024;

export interface ShardRouter {
  routeAttempt(answeredAt: string): string;
  isAnnual(shardId: string): boolean;
  checkSize(shardId: string, bytes: number): "ok" | "warn";
}

export class ShardSizeMigrationRequiredError extends Error {
  constructor(public readonly shardId: string, public readonly bytes: number) {
    super(`Event shard '${shardId}' exceeds the annual 50 MB limit; route it to monthly shards`);
    this.name = "ShardSizeMigrationRequiredError";
  }
}

export class AnnualShardRouter implements ShardRouter {
  constructor(private readonly warn: (message: string) => void = () => undefined) {}

  routeAttempt(answeredAt: string): string {
    const date = new Date(answeredAt);
    if (!Number.isFinite(date.getTime())) throw new Error("Attempt answered_at is not a valid timestamp");
    return String(date.getUTCFullYear());
  }

  isAnnual(shardId: string): boolean {
    return /^\d{4}$/.test(shardId);
  }

  checkSize(shardId: string, bytes: number): "ok" | "warn" {
    EventShardSchema.parse(shardId);
    if (bytes >= ANNUAL_SHARD_LIMIT_BYTES && this.isAnnual(shardId)) {
      throw new ShardSizeMigrationRequiredError(shardId, bytes);
    }
    if (bytes >= ANNUAL_SHARD_WARN_BYTES && this.isAnnual(shardId)) {
      this.warn(`Event shard '${shardId}' exceeds the 25 MB warning threshold`);
      return "warn";
    }
    return "ok";
  }
}
