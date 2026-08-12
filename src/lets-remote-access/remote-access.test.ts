import { describe, expect, it, vi } from "vitest";
import {
  buildRemoteUrl,
  buildServePlan,
  detectPublicIp,
  isIpv4Literal,
  isIpv6Literal,
  normalizePublicHostEntry,
  parseJsonIp,
  parseTextIp,
  PublicHostCache,
  resolveRemoteAccess,
} from "./remote-access";

describe("normalizePublicHostEntry", () => {
  it.each([
    ["1.2.3.4", { host: "1.2.3.4" }],
    [" 1.2.3.4 ", { host: "1.2.3.4" }],
    ["http://1.2.3.4:8080", { host: "1.2.3.4", port: "8080" }],
    ["https://home.example.com/mobile?x=1#top", { host: "home.example.com" }],
    ["home.example.com:8443", { host: "home.example.com", port: "8443" }],
    ["[2001:db8::1]:6806", { host: "2001:db8::1", port: "6806" }],
    ["[2001:db8::1]", { host: "2001:db8::1" }],
    ["2001:db8::1", { host: "2001:db8::1" }],
  ])("normalizes %s", (input, expected) => {
    expect(normalizePublicHostEntry(input)).toEqual(expected);
  });

  it.each(["", "   ", "http://", "not a host", "a b", "[not-ipv6]:6806"])(
    "rejects %s",
    (input) => {
      expect(normalizePublicHostEntry(input)).toBeNull();
    },
  );
});

describe("ip literals", () => {
  it("validates IPv4 addresses", () => {
    expect(isIpv4Literal("255.255.255.255")).toBe(true);
    expect(isIpv4Literal("256.1.1.1")).toBe(false);
    expect(isIpv4Literal("1.2.3")).toBe(false);
    expect(isIpv4Literal("1.2.3.4.5")).toBe(false);
  });

  it("validates IPv6 addresses", () => {
    expect(isIpv6Literal("::1")).toBe(true);
    expect(isIpv6Literal("2001:db8::1")).toBe(true);
    expect(isIpv6Literal("2001:db8:0:0:0:0:0:1")).toBe(true);
    expect(isIpv6Literal("1::2::3")).toBe(false);
    expect(isIpv6Literal("zz::1")).toBe(false);
    expect(isIpv6Literal("1.2.3.4")).toBe(false);
  });
});

describe("provider parsers", () => {
  it("parses plain text IPs", () => {
    expect(parseTextIp(" 1.2.3.4 \n")).toBe("1.2.3.4");
    expect(parseTextIp("2001:db8::1")).toBe("2001:db8::1");
    expect(parseTextIp("not-an-ip")).toBeNull();
  });

  it("parses JSON ip payloads", () => {
    expect(parseJsonIp('{"ip":"1.2.3.4"}')).toBe("1.2.3.4");
    expect(parseJsonIp('{"ip":"nope"}')).toBeNull();
    expect(parseJsonIp("garbage")).toBeNull();
  });
});

describe("buildRemoteUrl", () => {
  it("builds URLs and brackets IPv6 hosts", () => {
    expect(buildRemoteUrl("1.2.3.4", "http", "6806")).toBe("http://1.2.3.4:6806");
    expect(buildRemoteUrl("2001:db8::1", "http", "6806")).toBe("http://[2001:db8::1]:6806");
    expect(buildRemoteUrl("home.example.com", "https", "8443")).toBe(
      "https://home.example.com:8443",
    );
  });
});

describe("buildServePlan", () => {
  function conf(overrides: { system?: object; serverAddrs?: string[] } = {}) {
    return {
      system: {
        networkServe: true,
        networkServeTLS: false,
        container: "std",
        ...overrides.system,
      },
      serverAddrs: [
        "http://127.0.0.1:6806",
        "http://192.168.1.5:6806",
        "http://localhost:6806",
        ...(overrides.serverAddrs ?? []),
      ],
    };
  }

  it("reports an enabled desktop plan with LAN addresses only", () => {
    const plan = buildServePlan(conf(), "6806");
    expect(plan.serveEnabled).toBe(true);
    expect(plan.desktop).toBe(true);
    expect(plan.protocol).toBe("http");
    expect(plan.port).toBe("6806");
    expect(plan.lanUrls).toEqual(["http://192.168.1.5:6806"]);
  });

  it("reports TLS and falls back to the default port", () => {
    const plan = buildServePlan(conf({ system: { networkServeTLS: true } }), "");
    expect(plan.protocol).toBe("https");
    expect(plan.port).toBe("6806");
  });

  it("reports serve disabled when networkServe is off", () => {
    const plan = buildServePlan(conf({ system: { networkServe: false } }), "6806");
    expect(plan.serveEnabled).toBe(false);
  });
});

describe("detectPublicIp", () => {
  const providers = [
    { url: "https://a.example/ip", parse: parseTextIp },
    { url: "https://b.example/json", parse: parseJsonIp },
  ];

  it("returns the first valid provider response", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, text: async () => "" })
      .mockResolvedValueOnce({ ok: true, text: async () => '{"ip":"9.8.7.6"}' });
    await expect(detectPublicIp(fetcher, providers, 1000)).resolves.toBe("9.8.7.6");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("skips unusable content", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, text: async () => "not-an-ip" })
      .mockResolvedValueOnce({ ok: true, text: async () => '{"ip":"9.8.7.6"}' });
    await expect(detectPublicIp(fetcher, providers, 1000)).resolves.toBe("9.8.7.6");
  });

  it("returns null when every provider fails", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(detectPublicIp(fetcher, providers, 1000)).resolves.toBeNull();
  });
});

describe("PublicHostCache", () => {
  const singleProvider = [{ url: "https://ip.example/ip", parse: parseTextIp }];

  it("reuses a fresh result and refetches after invalidation", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, text: async () => "9.8.7.6" });
    const cache = new PublicHostCache(fetcher, 5 * 60_000, Date.now, singleProvider);
    await expect(cache.resolve()).resolves.toBe("9.8.7.6");
    await expect(cache.resolve()).resolves.toBe("9.8.7.6");
    expect(fetcher).toHaveBeenCalledTimes(1);

    cache.invalidate();
    await expect(cache.resolve()).resolves.toBe("9.8.7.6");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("expires cached entries after the ttl", async () => {
    let now = 0;
    const fetcher = vi.fn().mockResolvedValue({ ok: true, text: async () => "9.8.7.6" });
    const cache = new PublicHostCache(fetcher, 100, () => now, singleProvider);
    await cache.resolve();
    now = 101;
    await cache.resolve();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("resolveRemoteAccess", () => {
  it("prefers the manual host without any network call", async () => {
    const fetcher = vi.fn();
    const resolution = await resolveRemoteAccess(
      { system: { networkServe: true, networkServeTLS: false, container: "std" } },
      { manualHost: "home.example.com", locationPort: "6806", cache: new PublicHostCache(fetcher) },
    );
    expect(resolution.source).toBe("manual");
    expect(resolution.remoteUrl).toBe("http://home.example.com:6806");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("skips detection while serve is disabled", async () => {
    const fetcher = vi.fn();
    const resolution = await resolveRemoteAccess(
      { system: { networkServe: false, container: "std" } },
      { locationPort: "6806", cache: new PublicHostCache(fetcher) },
    );
    expect(resolution.remoteUrl).toBeNull();
    expect(resolution.detectFailed).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("builds the remote URL from the detected IP", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, text: async () => "203.0.113.7" });
    const resolution = await resolveRemoteAccess(
      { system: { networkServe: true, networkServeTLS: false, container: "std" } },
      { locationPort: "6806", cache: new PublicHostCache(fetcher) },
    );
    expect(resolution.source).toBe("detected");
    expect(resolution.remoteUrl).toBe("http://203.0.113.7:6806");
  });

  it("flags a failed detection", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    const resolution = await resolveRemoteAccess(
      { system: { networkServe: true, container: "std" } },
      { locationPort: "6806", cache: new PublicHostCache(fetcher) },
    );
    expect(resolution.detectFailed).toBe(true);
    expect(resolution.remoteUrl).toBeNull();
  });
});
