import type { StoreFileIO } from "./file-persistence";

const SIYUAN_PLUGIN_STORAGE_ROOT = "/data/storage/petal/siyuan-damophus/";

export interface PluginFileDataApi {
  loadData(storageName: string): Promise<unknown>;
  saveData(storageName: string, content: unknown): Promise<unknown>;
}

export interface DirectoryApi {
  request<T>(endpoint: string, payload: unknown): Promise<T>;
}

interface DirectoryEntry {
  name?: string;
  isDir?: boolean;
}

function loadedText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return typeof value === "string" ? value : JSON.stringify(value);
}

function pluginStorageName(path: string): string {
  if (!path.startsWith(SIYUAN_PLUGIN_STORAGE_ROOT)) {
    throw new Error("Damophus store path is outside the plugin storage root");
  }
  return path.slice(SIYUAN_PLUGIN_STORAGE_ROOT.length);
}

export class SiyuanPluginStoreFileIO implements StoreFileIO {
  constructor(
    private readonly data: PluginFileDataApi,
    private readonly directories: DirectoryApi,
    private readonly now: () => number = Date.now,
  ) {}

  async read(path: string): Promise<string | undefined> {
    return loadedText(await this.data.loadData(pluginStorageName(path)));
  }

  async write(path: string, content: string): Promise<void> {
    await this.data.saveData(pluginStorageName(path), content);
  }

  async list(path: string): Promise<string[]> {
    const result = await this.directories.request<DirectoryEntry[]>("/api/file/readDir", {path});
    return Array.isArray(result) ? result.flatMap((entry) => entry.name ? [entry.name] : []) : [];
  }

  async quarantine(path: string, content: string, reason: string): Promise<string> {
    const quarantinePath = `${path}.quarantine-${this.now()}.json`;
    await this.data.saveData(pluginStorageName(quarantinePath), JSON.stringify({
      quarantined_at: new Date(this.now()).toISOString(),
      source_path: path,
      reason,
      raw_content: content,
    }, null, 2));
    return quarantinePath;
  }
}
