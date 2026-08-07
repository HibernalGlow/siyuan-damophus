import { plugin } from "@/utils";
import { readDir } from "@/api";

export const AGENT_BRIDGE_ROOT = "agent-bridge";
const KERNEL_ROOT = "/data/storage/petal/siyuan-damophus/agent-bridge";

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value);
}

export class AgentBridgeStorage {
  async readJson<T>(relativePath: string): Promise<T | undefined> {
    const value = await plugin.loadData(`${AGENT_BRIDGE_ROOT}/${relativePath}`);
    const text = asText(value).trim();
    if (!text) return undefined;
    try {
      return JSON.parse(text) as T;
    } catch {
      return undefined;
    }
  }

  async writeJson(relativePath: string, value: unknown): Promise<void> {
    await plugin.saveData(`${AGENT_BRIDGE_ROOT}/${relativePath}`, JSON.stringify(value, null, 2));
  }

  async readText(relativePath: string): Promise<string> {
    return asText(await plugin.loadData(`${AGENT_BRIDGE_ROOT}/${relativePath}`));
  }

  async writeText(relativePath: string, value: string): Promise<void> {
    await plugin.saveData(`${AGENT_BRIDGE_ROOT}/${relativePath}`, value);
  }

  async remove(relativePath: string): Promise<void> {
    await plugin.removeData(`${AGENT_BRIDGE_ROOT}/${relativePath}`);
  }

  async listInbox(): Promise<string[]> {
    const entries = await readDir(`${KERNEL_ROOT}/inbox`);
    if (!Array.isArray(entries)) return [];
    return entries
      .filter((entry: any) => !entry.isDir && typeof entry.name === "string" && entry.name.endsWith(".json"))
      .map((entry: any) => entry.name)
      .sort();
  }
}
