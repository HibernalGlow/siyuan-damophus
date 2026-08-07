import { describe, expect, it, vi } from "vitest";
import { SiyuanPluginStoreFileIO } from "./siyuan-file-io";

describe("SiYuan TinyBase file IO", () => {
  it("uses plugin-relative names for data APIs and kernel paths for directory APIs", async () => {
    const data = {
      loadData: vi.fn(async () => "content"),
      saveData: vi.fn(async () => undefined),
    };
    const directories = {
      request: vi.fn(async (_endpoint: string, _payload: unknown) => [{name: "device-a", isDir: true}]),
    } as any;
    const io = new SiyuanPluginStoreFileIO(data, directories);
    const path = "/data/storage/petal/siyuan-damophus/store/devices/device-a/core.json";

    await expect(io.read(path)).resolves.toBe("content");
    await io.write(path, "next");
    await expect(io.list("/data/storage/petal/siyuan-damophus/store/devices"))
      .resolves.toEqual(["device-a"]);

    expect(data.loadData).toHaveBeenCalledWith("store/devices/device-a/core.json");
    expect(data.saveData).toHaveBeenCalledWith("store/devices/device-a/core.json", "next");
    expect(directories.request).toHaveBeenCalledWith("/api/file/readDir", {
      path: "/data/storage/petal/siyuan-damophus/store/devices",
    });
  });

  it("rejects reads and writes outside the plugin storage root", async () => {
    const io = new SiyuanPluginStoreFileIO(
      {loadData: vi.fn(), saveData: vi.fn()},
      {request: vi.fn(async (_endpoint: string, _payload: unknown) => [])} as any,
    );
    await expect(io.read("/data/unsafe.json")).rejects.toThrow("outside the plugin storage root");
    await expect(io.write("/data/unsafe.json", "x")).rejects.toThrow("outside the plugin storage root");
  });
});
