import { readDir } from "@/api";
import { plugin } from "@/utils";
import { isAiConfigEnvelope, type AiConfigEnvelope } from "./sync-model";

const STORAGE_ROOT = "ai-config-sync/devices";
const KERNEL_ROOT = "/data/storage/petal/siyuan-damophus/ai-config-sync/devices";

function parseJson(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return value;
}

export class AiConfigSyncStorage {
  async readAll(): Promise<AiConfigEnvelope[]> {
    let entries: unknown;
    try {
      entries = await readDir(KERNEL_ROOT);
    } catch {
      return [];
    }
    if (!Array.isArray(entries)) return [];
    const files = entries
      .filter((entry: any) => !entry.isDir && typeof entry.name === "string" && entry.name.endsWith(".json"))
      .map((entry: any) => entry.name as string)
      .sort();
    const values = await Promise.all(files.map((name) => plugin.loadData(`${STORAGE_ROOT}/${name}`)));
    return values.map(parseJson).filter(isAiConfigEnvelope);
  }

  async write(envelope: AiConfigEnvelope): Promise<void> {
    await plugin.saveData(
      `${STORAGE_ROOT}/${envelope.deviceId}.json`,
      JSON.stringify(envelope, null, 2),
    );
  }
}
