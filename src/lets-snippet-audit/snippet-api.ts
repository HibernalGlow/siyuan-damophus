import { request, requestStrict } from "@/api";
import type { SiyuanSnippet } from "./snippet-audit";

export async function getAllSnippets(): Promise<SiyuanSnippet[]> {
  const data = await request("/api/snippet/getSnippet", { type: "all", enabled: 2 });
  return Array.isArray(data?.snippets) ? data.snippets : [];
}

export async function setSnippetEnabled(id: string, enabled: boolean): Promise<SiyuanSnippet[]> {
  const current = await getAllSnippets();
  const index = current.findIndex((snippet) => snippet.id === id);
  if (index < 0) throw new Error("Snippet no longer exists");
  const next = current.map((snippet, snippetIndex) => snippetIndex === index ? { ...snippet, enabled } : snippet);
  await requestStrict<unknown>("/api/snippet/setSnippet", { snippets: next });
  const verified = await getAllSnippets();
  if (verified.length !== current.length || verified.find((snippet) => snippet.id === id)?.enabled !== enabled) {
    throw new Error("Snippet registry verification failed");
  }
  return verified;
}

function sameSnippet(actual: SiyuanSnippet | undefined, expected: SiyuanSnippet): boolean {
  return Boolean(actual && actual.name === expected.name && actual.type === expected.type && actual.enabled === expected.enabled && actual.content === expected.content);
}

export async function saveSnippet(snippet: SiyuanSnippet, create: boolean): Promise<SiyuanSnippet[]> {
  const current = await getAllSnippets();
  const existingIndex = current.findIndex((item) => item.id === snippet.id);
  if (create && existingIndex >= 0) throw new Error("Snippet ID already exists");
  if (!create && existingIndex < 0) throw new Error("Snippet no longer exists");
  const next = create
    ? [snippet, ...current]
    : current.map((item, index) => index === existingIndex ? snippet : item);
  await requestStrict<unknown>("/api/snippet/setSnippet", { snippets: next });
  const verified = await getAllSnippets();
  const expectedCount = current.length + (create ? 1 : 0);
  if (verified.length !== expectedCount || !sameSnippet(verified.find((item) => item.id === snippet.id), snippet)) {
    throw new Error("Snippet registry verification failed");
  }
  return verified;
}

export async function deleteSnippet(id: string): Promise<SiyuanSnippet[]> {
  const current = await getAllSnippets();
  if (!current.some((snippet) => snippet.id === id)) throw new Error("Snippet no longer exists");
  const next = current.filter((snippet) => snippet.id !== id);
  await requestStrict<unknown>("/api/snippet/setSnippet", { snippets: next });
  const verified = await getAllSnippets();
  if (verified.length !== current.length - 1 || verified.some((snippet) => snippet.id === id)) {
    throw new Error("Snippet registry verification failed");
  }
  return verified;
}

export interface SnippetGlobalSettings {
  enabledCSS: boolean;
  enabledJS: boolean;
}

export function getSnippetGlobalSettings(): SnippetGlobalSettings {
  return {
    enabledCSS: window.siyuan?.config?.snippet?.enabledCSS !== false,
    enabledJS: window.siyuan?.config?.snippet?.enabledJS !== false,
  };
}

export async function setSnippetTypeEnabled(type: "css" | "js", enabled: boolean): Promise<SnippetGlobalSettings> {
  const settings = getSnippetGlobalSettings();
  if (type === "css") settings.enabledCSS = enabled;
  else settings.enabledJS = enabled;
  await requestStrict<unknown>("/api/setting/setSnippet", settings);
  if (window.siyuan?.config?.snippet) Object.assign(window.siyuan.config.snippet, settings);
  return settings;
}
