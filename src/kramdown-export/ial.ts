import type { IalExportOptions } from "@hibernalglow/damophus-agent-contract";

const DEFAULT_PORTABLE_EXCLUDES = [
  "id",
  "update",
  "updated",
  "custom-sy-av-*",
  "custom-av-*",
  "av-*",
  "data-av-*",
];

interface IalToken {
  name?: string;
  raw: string;
}

function patternMatches(name: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/gu, "\\$&").replace(/\*/gu, ".*");
  return new RegExp(`^${escaped}$`, "u").test(name);
}

function matchesAny(name: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => patternMatches(name, pattern));
}

function parseIalTokens(value: string): IalToken[] {
  const tokens: IalToken[] = [];
  let index = 0;
  while (index < value.length) {
    while (/\s/u.test(value[index] ?? "")) index += 1;
    if (index >= value.length) break;
    const start = index;
    while (index < value.length && !/[\s=]/u.test(value[index])) index += 1;
    const name = value.slice(start, index);
    const nameEnd = index;
    while (/\s/u.test(value[index] ?? "")) index += 1;
    if (value[index] !== "=") {
      index = nameEnd;
      const raw = value.slice(start, nameEnd);
      tokens.push({
        raw,
        name: raw.startsWith("#") ? "id" : (raw.startsWith(".") ? "class" : undefined),
      });
      continue;
    }
    index += 1;
    while (/\s/u.test(value[index] ?? "")) index += 1;
    const quote = value[index] === "\"" || value[index] === "'" ? value[index++] : undefined;
    if (quote) {
      while (index < value.length) {
        if (value[index] === "\\") {
          index += 2;
          continue;
        }
        if (value[index++] === quote) break;
      }
    } else {
      while (index < value.length && !/\s/u.test(value[index])) index += 1;
    }
    tokens.push({ name, raw: value.slice(start, index) });
  }
  return tokens;
}

function keepAttribute(name: string | undefined, options: IalExportOptions): boolean {
  if (!name) return options.mode !== "none";
  if (matchesAny(name, options.exclude)) return false;
  if (matchesAny(name, options.include)) return true;
  if (options.mode === "none") return false;
  if (options.mode === "all") return true;
  return !matchesAny(name, DEFAULT_PORTABLE_EXCLUDES);
}

function filterIal(value: string, options: IalExportOptions): string {
  const kept = parseIalTokens(value).filter((token) => keepAttribute(token.name, options));
  return kept.length > 0 ? `{: ${kept.map((token) => token.raw).join(" ")}}` : "";
}

function filterLine(line: string, options: IalExportOptions): string {
  let output = "";
  let cursor = 0;
  let codeTicks = 0;
  while (cursor < line.length) {
    if (line[cursor] === "`") {
      let end = cursor + 1;
      while (line[end] === "`") end += 1;
      const count = end - cursor;
      codeTicks = codeTicks === 0 ? count : (codeTicks === count ? 0 : codeTicks);
      output += line.slice(cursor, end);
      cursor = end;
      continue;
    }
    if (codeTicks === 0 && line.startsWith("{:", cursor)) {
      let end = cursor + 2;
      let quote: string | undefined;
      while (end < line.length) {
        const character = line[end];
        if (quote && character === "\\") {
          end += 2;
          continue;
        }
        if (character === "\"" || character === "'") {
          quote = quote === character ? undefined : (quote ?? character);
        } else if (character === "}" && !quote) {
          break;
        }
        end += 1;
      }
      if (end < line.length) {
        output += filterIal(line.slice(cursor + 2, end).trim(), options);
        cursor = end + 1;
        continue;
      }
    }
    output += line[cursor++];
  }
  return output;
}

export function filterKramdownIal(kramdown: string, options: IalExportOptions): string {
  let fence: string | undefined;
  const output = kramdown.split("\n").map((line) => {
    const fenceMatch = line.match(/^\s*(?:>\s*)*(`{3,}|~{3,})/u);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) fence = marker;
      else if (fence === marker) fence = undefined;
      return line;
    }
    return fence ? line : filterLine(line, options);
  }).join("\n");
  return output.replace(/^[ \t]+$/gmu, "");
}

export function containsHtmlTable(kramdown: string): boolean {
  let fence: string | undefined;
  for (const line of kramdown.split("\n")) {
    const fenceMatch = line.match(/^\s*(?:>\s*)*(`{3,}|~{3,})/u);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) fence = marker;
      else if (fence === marker) fence = undefined;
      continue;
    }
    if (fence) continue;
    let visible = "";
    let cursor = 0;
    let codeTicks = 0;
    while (cursor < line.length) {
      if (line[cursor] === "`") {
        let end = cursor + 1;
        while (line[end] === "`") end += 1;
        const count = end - cursor;
        codeTicks = codeTicks === 0 ? count : (codeTicks === count ? 0 : codeTicks);
        cursor = end;
        continue;
      }
      if (codeTicks === 0) visible += line[cursor];
      cursor += 1;
    }
    if (/<\/?table\b/iu.test(visible)) return true;
  }
  return false;
}
