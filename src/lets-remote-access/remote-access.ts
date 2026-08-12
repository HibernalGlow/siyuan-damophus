/**
 * Framework-independent core for the remote-access module.
 *
 * Reads the SiYuan serve configuration, resolves a public host (manual
 * override or auto-detected public IP), and builds the mobile URL that can
 * be opened on a phone. No SiYuan kernel calls or DOM access live here;
 * the host state is passed in or read through the small window helpers.
 */

export const DEFAULT_SERVE_PORT = "6806";

/** Shape of `window.siyuan.config`, reduced to the fields this module reads. */
export interface HostConfigShape {
  system?: {
    networkServe?: boolean;
    networkServeTLS?: boolean;
    container?: string;
  };
  serverAddrs?: string[];
}

export interface ServePlan {
  serveEnabled: boolean;
  tls: boolean;
  /** True when the host is the desktop Electron app (`container === "std"`). */
  desktop: boolean;
  protocol: "http" | "https";
  port: string;
  /** LAN addresses from the kernel, with loopback entries filtered out. */
  lanUrls: string[];
}

export interface PublicHostEntry {
  host: string;
  /** Explicit port entered with the manual host; the serve port is used otherwise. */
  port?: string;
}

export interface RemoteAccessResolution {
  plan: ServePlan;
  publicHost: string | null;
  source: "manual" | "detected" | "none";
  detectFailed: boolean;
  remoteUrl: string | null;
}

const IPV4_PATTERN = /^(\d{1,3})(\.\d{1,3}){3}$/;
const DOMAIN_PATTERN =
  /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

export function readHostConfig(): HostConfigShape | null {
  if (typeof window === "undefined") return null;
  const host = window as unknown as { siyuan?: { config?: HostConfigShape } };
  return host.siyuan?.config ?? null;
}

export function readServePort(): string {
  if (typeof window === "undefined") return "";
  return typeof window.location?.port === "string" ? window.location.port : "";
}

export function isIpv4Literal(host: string): boolean {
  if (!IPV4_PATTERN.test(host)) return false;
  return host.split(".").every((part) => Number(part) >= 0 && Number(part) <= 255);
}

export function isIpv6Literal(host: string): boolean {
  if (!/^[0-9a-fA-F:]+$/.test(host) || !host.includes(":")) return false;
  if ((host.match(/::/g) ?? []).length > 1) return false;
  const halves = host.split("::");
  const countGroups = (group: string) => (group === "" ? 0 : group.split(":").length);
  if (halves.length === 1) return countGroups(host) === 8;
  return halves.reduce((total, group) => total + countGroups(group), 0) < 8;
}

export function isDomainLiteral(host: string): boolean {
  return host.includes(".") && DOMAIN_PATTERN.test(host);
}

export function isIpLiteral(host: string): boolean {
  return isIpv4Literal(host) || isIpv6Literal(host);
}

/**
 * Normalizes user input into a host plus an optional explicit port.
 * Accepts a bare IP (IPv4/IPv6), a bracketed IPv6 with port, a DDNS-style
 * domain, and tolerates a leading scheme or trailing path.
 */
export function normalizePublicHostEntry(input: string): PublicHostEntry | null {
  let value = input.trim();
  if (!value) return null;
  value = value.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
  value = value.split(/[/?#]/, 1)[0];
  value = value.trim();
  if (!value) return null;

  if (isIpv6Literal(value)) return { host: value };

  const bracketed = value.match(/^\[([0-9a-fA-F:]+)\](?::(\d{1,5}))?$/);
  if (bracketed) {
    if (!isIpv6Literal(bracketed[1])) return null;
    return bracketed[2] === undefined
      ? { host: bracketed[1] }
      : { host: bracketed[1], port: bracketed[2] };
  }

  const bare = value.match(/^([^:]+)(?::(\d{1,5}))?$/);
  if (!bare) return null;
  const host = bare[1];
  const port = bare[2];
  if (!isIpv4Literal(host) && !isDomainLiteral(host)) return null;
  return port === undefined ? { host } : { host, port };
}

export function formatUrlHost(host: string): string {
  return isIpv6Literal(host) ? `[${host}]` : host;
}

export function buildRemoteUrl(host: string, protocol: "http" | "https", port: string): string {
  return `${protocol}://${formatUrlHost(host)}:${port}`;
}

function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

export function buildServePlan(
  conf: HostConfigShape | null | undefined,
  locationPort = "",
  fallbackPort = DEFAULT_SERVE_PORT,
): ServePlan {
  const serveEnabled = conf?.system?.networkServe === true;
  const tls = conf?.system?.networkServeTLS === true;
  const container = conf?.system?.container ?? "";
  const port =
    /^\d{1,5}$/.test(locationPort) && locationPort !== "0" ? locationPort : fallbackPort;
  return {
    serveEnabled,
    tls,
    desktop: container === "std",
    protocol: tls ? "https" : "http",
    port,
    lanUrls: (conf?.serverAddrs ?? []).filter((url) => !isLoopbackUrl(url)),
  };
}

export type PublicIpFetcher = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; text(): Promise<string> }>;

const defaultFetcher: PublicIpFetcher = (url, init) => globalThis.fetch(url, init);

export interface PublicIpProvider {
  url: string;
  parse(body: string): string | null;
}

export function parseTextIp(body: string): string | null {
  const host = body.trim();
  return isIpLiteral(host) ? host : null;
}

export function parseJsonIp(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { ip?: unknown };
    const host = typeof parsed?.ip === "string" ? parsed.ip.trim() : "";
    return isIpLiteral(host) ? host : null;
  } catch {
    return null;
  }
}

/** China-friendly text provider first, global JSON providers as fallbacks. */
export const PUBLIC_IP_PROVIDERS: readonly PublicIpProvider[] = [
  { url: "https://4.ipw.cn", parse: parseTextIp },
  { url: "https://api.ipify.org?format=json", parse: parseJsonIp },
  { url: "https://api64.ipify.org?format=json", parse: parseJsonIp },
];

export function createTimeoutSignal(timeoutMs: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

/**
 * Queries every provider in parallel and returns the first valid IP.
 * Returns null when every provider fails or returns unusable content.
 */
export async function detectPublicIp(
  fetcher: PublicIpFetcher = defaultFetcher,
  providers: readonly PublicIpProvider[] = PUBLIC_IP_PROVIDERS,
  timeoutMs = 6000,
): Promise<string | null> {
  const attempts = providers.map(async (provider) => {
    try {
      const response = await fetcher(provider.url, { signal: createTimeoutSignal(timeoutMs) });
      if (!response.ok) return null;
      return provider.parse(await response.text());
    } catch {
      return null;
    }
  });
  const settled = await Promise.allSettled(attempts);
  for (const result of settled) {
    if (result.status === "fulfilled" && result.value) return result.value;
  }
  return null;
}

export class PublicHostCache {
  private entry: { host: string; at: number } | null = null;
  private inFlight: Promise<string | null> | null = null;

  constructor(
    private readonly fetcher: PublicIpFetcher = defaultFetcher,
    private readonly ttlMs = 5 * 60_000,
    private readonly now: () => number = Date.now,
    private readonly providers: readonly PublicIpProvider[] = PUBLIC_IP_PROVIDERS,
  ) {}

  resolve(): Promise<string | null> {
    const cached = this.entry;
    if (cached && this.now() - cached.at < this.ttlMs) return Promise.resolve(cached.host);
    if (this.inFlight) return this.inFlight;
    this.inFlight = detectPublicIp(this.fetcher, this.providers)
      .then((host) => {
        if (host) this.entry = { host, at: this.now() };
        return host;
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  invalidate(): void {
    this.entry = null;
  }
}

export async function resolveRemoteAccess(
  conf: HostConfigShape | null | undefined,
  options: { manualHost?: string; locationPort?: string; cache?: PublicHostCache } = {},
): Promise<RemoteAccessResolution> {
  const plan = buildServePlan(conf, options.locationPort);
  const manual = normalizePublicHostEntry(options.manualHost ?? "");
  if (manual) {
    return {
      plan,
      publicHost: manual.host,
      source: "manual",
      detectFailed: false,
      remoteUrl: buildRemoteUrl(manual.host, plan.protocol, manual.port ?? plan.port),
    };
  }
  if (!plan.serveEnabled) {
    return { plan, publicHost: null, source: "none", detectFailed: false, remoteUrl: null };
  }
  const cache = options.cache ?? new PublicHostCache();
  const host = await cache.resolve();
  if (host) {
    return {
      plan,
      publicHost: host,
      source: "detected",
      detectFailed: false,
      remoteUrl: buildRemoteUrl(host, plan.protocol, plan.port),
    };
  }
  return { plan, publicHost: null, source: "none", detectFailed: true, remoteUrl: null };
}
