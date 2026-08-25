import { getLogger } from "@/libs/logger";
import {
  FSRS_OPTIMIZER_PORT,
  type FsrsOptimizationResult,
  type FsrsTrainingDataset,
  validateOptimizationResult,
} from "./fsrs-optimizer-protocol";

declare const require: ((id: string) => unknown) | undefined;

const log = getLogger("fsrs-optimizer");
const LOOPBACK_HOST = "127.0.0.1";
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_RESULT_BYTES = 64 * 1024;

type RuntimeRequire = (id: string) => unknown;

interface IncomingMessageLike {
  method?: string;
  url?: string;
  on(event: "data", listener: (chunk: Uint8Array) => void): void;
  on(event: "end" | "error", listener: (error?: Error) => void): void;
}

interface ServerResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string | Uint8Array): void;
}

interface HttpServerLike {
  listen(port: number, host: string, callback: () => void): void;
  close(callback?: (error?: Error) => void): void;
  once(event: "error", listener: (error: Error & { code?: string }) => void): void;
  address(): { port: number } | string | null;
}

interface NativeRuntime {
  createServer(handler: (request: IncomingMessageLike, response: ServerResponseLike) => void): HttpServerLike;
  randomBytes(size: number): { toString(encoding: "hex"): string };
  openExternal(url: string): Promise<void>;
}

export interface OptimizerAsset {
  body: Uint8Array;
  contentType: string;
}

export type OptimizerAssets = ReadonlyMap<string, OptimizerAsset>;

export interface FsrsOptimizerLocalServiceOptions {
  host?: string;
  port?: number;
  timeoutMs?: number;
  runtime?: NativeRuntime;
}

export const FSRS_OPTIMIZER_ASSET_PATHS = [
  "/index.html",
  "/app.js",
  "/styles.css",
  "/train-worker.js",
  "/vendor/fsrs_browser.js",
  "/vendor/fsrs_browser_bg.wasm",
  "/vendor/snippets/wasm-bindgen-rayon-38edf6e439f6d70d/src/workerHelpers.js",
] as const;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
};

function runtimeRequire(): RuntimeRequire | undefined {
  if (typeof require === "function") return require;
  const scope = globalThis as typeof globalThis & {
    require?: RuntimeRequire;
    window?: { require?: RuntimeRequire };
  };
  return scope.window?.require ?? scope.require;
}

function loadNativeRuntime(): NativeRuntime {
  const require = runtimeRequire();
  if (!require) throw new Error("FSRS optimizer requires SiYuan Desktop");
  const http = require("node:http") as { createServer: NativeRuntime["createServer"] };
  const crypto = require("node:crypto") as { randomBytes: NativeRuntime["randomBytes"] };
  const electron = require("electron") as { shell?: { openExternal(url: string): Promise<void> } };
  if (!http?.createServer || !crypto?.randomBytes || !electron?.shell?.openExternal) {
    throw new Error("SiYuan Desktop native runtime is missing HTTP or browser support");
  }
  return {
    createServer: http.createServer,
    randomBytes: crypto.randomBytes,
    openExternal: (url) => electron.shell!.openExternal(url),
  };
}

function contentType(path: string): string {
  const extension = Object.keys(CONTENT_TYPES).find((candidate) => path.endsWith(candidate));
  return extension ? CONTENT_TYPES[extension] : "application/octet-stream";
}

export async function loadFsrsOptimizerAssets(pluginName: string): Promise<OptimizerAssets> {
  const assets = new Map<string, OptimizerAsset>();
  for (const path of FSRS_OPTIMIZER_ASSET_PATHS) {
    const response = await fetch(`/plugins/${encodeURIComponent(pluginName)}/fsrs-optimizer${path}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load optimizer asset ${path}: HTTP ${response.status}`);
    assets.set(path, {
      body: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") || contentType(path),
    });
  }
  return assets;
}

function setSecurityHeaders(response: ServerResponseLike): void {
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; connect-src 'self'; worker-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'",
  );
}

function sendJson(response: ServerResponseLike, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

function readJsonBody(request: IncomingMessageLike): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let length = 0;
    request.on("data", (chunk) => {
      length += chunk.byteLength;
      if (length > MAX_RESULT_BYTES) {
        reject(new Error("Optimizer response is too large"));
        return;
      }
      chunks.push(chunk);
    });
    request.on("error", (error) => reject(error ?? new Error("Unable to read optimizer response")));
    request.on("end", () => {
      try {
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        resolve(JSON.parse(new TextDecoder().decode(bytes)));
      } catch (error) {
        reject(error);
      }
    });
  });
}

export class FsrsOptimizerLocalService {
  private readonly host: string;
  private readonly port: number;
  private readonly timeoutMs: number;
  private readonly runtime: NativeRuntime;
  private server?: HttpServerLike;
  private rejectPending?: (error: Error) => void;
  private timeout?: ReturnType<typeof setTimeout>;

  constructor(options: FsrsOptimizerLocalServiceOptions = {}) {
    this.host = options.host ?? LOOPBACK_HOST;
    this.port = options.port ?? FSRS_OPTIMIZER_PORT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.runtime = options.runtime ?? loadNativeRuntime();
  }

  get running(): boolean {
    return Boolean(this.server);
  }

  async optimize(dataset: FsrsTrainingDataset, assets: OptimizerAssets): Promise<FsrsOptimizationResult> {
    if (this.server) throw new Error("An FSRS optimization session is already running");
    if (dataset.records.length === 0) throw new Error("No Riff review records are available for optimization");
    const token = this.runtime.randomBytes(24).toString("hex");
    let resolveResult!: (result: FsrsOptimizationResult) => void;
    let rejectResult!: (error: Error) => void;
    const resultPromise = new Promise<FsrsOptimizationResult>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    void resultPromise.catch(() => undefined);
    this.rejectPending = rejectResult;
    this.server = this.runtime.createServer((request, response) => {
      void this.handleRequest(request, response, token, dataset, assets, resolveResult, rejectResult);
    });
    try {
      const actualPort = await this.listen();
      this.timeout = setTimeout(() => rejectResult(new Error("FSRS optimizer session timed out")), this.timeoutMs);
      const url = `http://${this.host}:${actualPort}/?token=${encodeURIComponent(token)}`;
      log.info("optimizer-session-open", { port: actualPort, records: dataset.sourceRecordCount, cards: dataset.cardCount });
      await this.runtime.openExternal(url);
      return await resultPromise;
    } finally {
      await this.stop(false);
    }
  }

  async stop(rejectPending = true): Promise<void> {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = undefined;
    if (rejectPending) this.rejectPending?.(new Error("FSRS optimizer session stopped"));
    this.rejectPending = undefined;
    const server = this.server;
    this.server = undefined;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private listen(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = this.server!;
      server.once("error", (error) => {
        const detail = error.code === "EADDRINUSE"
          ? `Local optimizer port ${this.port} is already in use`
          : error.message;
        reject(new Error(detail));
      });
      server.listen(this.port, this.host, () => {
        const address = server.address();
        resolve(typeof address === "object" && address ? address.port : this.port);
      });
    });
  }

  private async handleRequest(
    request: IncomingMessageLike,
    response: ServerResponseLike,
    token: string,
    dataset: FsrsTrainingDataset,
    assets: OptimizerAssets,
    resolveResult: (result: FsrsOptimizationResult) => void,
    rejectResult: (error: Error) => void,
  ): Promise<void> {
    setSecurityHeaders(response);
    const url = new URL(request.url ?? "/", `http://${this.host}`);
    const authorized = url.searchParams.get("token") === token;
    try {
      if (request.method === "GET" && url.pathname === "/api/session") {
        if (!authorized) return sendJson(response, 403, { error: "Invalid session token" });
        return sendJson(response, 200, dataset);
      }
      if (request.method === "POST" && url.pathname === "/api/result") {
        if (!authorized) return sendJson(response, 403, { error: "Invalid session token" });
        const result = validateOptimizationResult(await readJsonBody(request));
        if (result.sourceRecordCount !== dataset.sourceRecordCount || result.cardCount !== dataset.cardCount) {
          throw new Error("Optimizer result does not match the active dataset");
        }
        sendJson(response, 200, { accepted: true });
        resolveResult(result);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/error") {
        if (!authorized) return sendJson(response, 403, { error: "Invalid session token" });
        const value = await readJsonBody(request) as { message?: unknown };
        const message = typeof value?.message === "string" ? value.message : "Browser optimizer failed";
        sendJson(response, 200, { accepted: true });
        rejectResult(new Error(message));
        return;
      }
      if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
      const assetPath = url.pathname === "/" ? "/index.html" : url.pathname;
      if (assetPath === "/index.html" && !authorized) return sendJson(response, 403, { error: "Invalid session token" });
      const normalizedPath = assetPath === "/vendor/" ? "/vendor/fsrs_browser.js" : assetPath;
      const asset = assets.get(normalizedPath);
      if (!asset) return sendJson(response, 404, { error: "Not found" });
      response.statusCode = 200;
      response.setHeader("Content-Type", asset.contentType);
      response.end(asset.body);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      sendJson(response, 400, { error: failure.message });
      if (url.pathname === "/api/result" || url.pathname === "/api/error") rejectResult(failure);
    }
  }
}
