import type { StoreFileIO } from "./file-persistence";

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

export class SiyuanPluginStoreFileIO implements StoreFileIO {
  constructor(
    private readonly data: PluginFileDataApi,
    private readonly directories: DirectoryApi,
    private readonly now: () => number = Date.now,
  ) {}

  async read(path: string): Promise<string | undefined> {
    return loadedText(await this.data.loadData(path));
  }

  async write(path: string, content: string): Promise<void> {
    await this.data.saveData(path, content);
  }

  async list(path: string): Promise<string[]> {
    const result = await this.directories.request<DirectoryEntry[]>("/api/file/readDir", {path});
    return result.flatMap((entry) => entry.name ? [entry.name] : []);
  }

  async quarantine(path: string, content: string, reason: string): Promise<string> {
    const quarantinePath = `${path}.quarantine-${this.now()}.json`;
    await this.data.saveData(quarantinePath, JSON.stringify({
      quarantined_at: new Date(this.now()).toISOString(),
      source_path: path,
      reason,
      raw_content: content,
    }, null, 2));
    return quarantinePath;
  }
}
