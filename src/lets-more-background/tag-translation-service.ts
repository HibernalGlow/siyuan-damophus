import { saveDynamicTagTranslation, getDetailedTagInfo, type TagDefinition } from "./tag-dictionary";
import { getLogger } from "@/libs/logger";

const log = getLogger("tag-translation-service");

/**
 * 免费在线翻译单个未收录的 Tag (走 MyMemory / 翻译接口并自动存入持久化缓存)
 */
export async function translateSingleTagOnline(tag: string): Promise<string | null> {
  const clean = tag.trim().toLowerCase().replace(/\s+/g, "_");
  const query = clean.replace(/_/g, " ");

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(query)}&langpair=en|zh-CN`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = await res.json();
      const translated = data?.responseData?.translatedText;
      if (translated && typeof translated === "string" && translated.toLowerCase() !== query.toLowerCase()) {
        const cleanZh = translated.trim();
        saveDynamicTagTranslation(clean, cleanZh, "general");
        return cleanZh;
      }
    }
  } catch (e) {
    log.warn(`Failed to translate tag "${tag}" online:`, e);
  }

  return null;
}

/**
 * 批量异步解析并补全未翻译的 Tags
 */
export async function batchResolveTagsOnline(tags: string[]): Promise<void> {
  const missing = tags.filter((t) => {
    const info = getDetailedTagInfo(t);
    // 如果中文与英文下划线替换后完全一样，说明尚未收录精校中文
    return !info.zh || info.zh.toLowerCase() === t.toLowerCase().replace(/_/g, " ");
  });

  if (missing.length === 0) return;

  // 每次并发最多 5 个以保证稳定性
  const chunks: string[][] = [];
  for (let i = 0; i < missing.length; i += 5) {
    chunks.push(missing.slice(i, i + 5));
  }

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (t) => {
        try {
          await translateSingleTagOnline(t);
        } catch {}
      }),
    );
  }
}
