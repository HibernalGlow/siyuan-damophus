import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, unmount } from "svelte";
import RemoteAccessSettings from "./RemoteAccessSettings.svelte";

const labels = {
  serveStatus: "Serve status",
  serveEnabled: "On",
  serveDisabled: "Off",
  serveDisabledHint: "Enable Network Serve in SiYuan Settings - About, then restart SiYuan.",
  desktopOnlyHint: "Desktop app only.",
  publicUrl: "Mobile URL",
  publicUrlDescription: "Open this address on your phone.",
  publicHost: "Public address",
  publicHostDescription: "Leave empty to auto-detect.",
  publicHostPlaceholder: "e.g. 1.2.3.4",
  lanUrls: "LAN addresses",
  lanUrlsDescription: "Same Wi-Fi network.",
  autoDetected: "Auto-detected public IP",
  detecting: "Detecting public IP...",
  detectFailed: "Detection failed",
  copy: "Copy",
  copied: "Copied",
  refresh: "Refresh",
};

const mounted: Array<ReturnType<typeof mount>> = [];

function stubServe({ enabled = true, container = "std" } = {}) {
  vi.stubGlobal("siyuan", {
    config: {
      system: { networkServe: enabled, networkServeTLS: false, container },
      serverAddrs: ["http://127.0.0.1:6806", "http://192.168.1.5:6806"],
    },
  });
}

beforeEach(() => {
  stubServe();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "203.0.113.7" }));
});

afterEach(async () => {
  for (const component of mounted.splice(0)) await unmount(component);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function render(events: Record<string, (event: CustomEvent) => void> = {}, publicHost = "") {
  const component = mount(RemoteAccessSettings, {
    target: document.body,
    props: { group: "remoteAccess", title: "Remote Access", publicHost, labels },
    events,
  });
  mounted.push(component);
  return component;
}

describe("remote access settings", () => {
  it("shows the detected public URL and the LAN addresses", async () => {
    render();

    await vi.waitFor(() => {
      expect(
        document.querySelector<HTMLElement>('[data-testid="public-url-row"] code')?.textContent,
      ).toMatch(/^http:\/\/203\.0\.113\.7:\d+$/);
    });
    expect(document.body.textContent).toContain("Auto-detected public IP: 203.0.113.7");
    expect(document.body.textContent).toContain("http://192.168.1.5:6806");
    expect(document.body.textContent).not.toContain("127.0.0.1");
  });

  it("copies the public URL to the clipboard", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render();

    await vi.waitFor(() => {
      expect(
        document.querySelector<HTMLElement>('[data-testid="public-url-row"] code')?.textContent,
      ).toMatch(/^http:\/\//);
    });
    document
      .querySelector<HTMLButtonElement>('[data-testid="public-url-row"] button')
      ?.click();

    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toMatch(/^http:\/\/203\.0\.113\.7:\d+$/);
  });

  it("commits a manual public address", async () => {
    const changed = vi.fn();
    render({ changed });

    const input = document.querySelector<HTMLInputElement>("input")!;
    input.value = "home.example.com";
    input.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    expect(changed.mock.calls[0][0].detail).toMatchObject({
      group: "remoteAccess",
      key: "publicHost",
      value: "home.example.com",
    });
  });

  it("explains how to enable serve when it is off", async () => {
    stubServe({ enabled: false });
    render();

    expect(document.body.textContent).toContain("Off");
    expect(document.body.textContent).toContain(
      "Enable Network Serve in SiYuan Settings - About, then restart SiYuan.",
    );
    expect(document.body.textContent).not.toContain("http://192.168.1.5:6806");
  });
});
