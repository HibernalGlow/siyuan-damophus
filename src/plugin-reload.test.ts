import { describe, expect, it, vi } from "vitest";
import { reloadPetal } from "./plugin-reload";

describe("reloadPetal", () => {
  it("disables the plugin before enabling it again", async () => {
    const toggle = vi.fn(async () => ({ code: 0 }));
    const wait = vi.fn(async () => {});

    await expect(reloadPetal(toggle, wait)).resolves.toEqual({ code: 0 });
    expect(toggle.mock.calls).toEqual([[false], [true]]);
    expect(wait).toHaveBeenCalledWith(180);
  });

  it("does not enable after a failed disable", async () => {
    const toggle = vi.fn(async () => ({ code: 1, msg: "failed" }));

    await expect(reloadPetal(toggle)).resolves.toEqual({ code: 1, msg: "failed" });
    expect(toggle).toHaveBeenCalledOnce();
  });
});
