import { plugin } from "@/utils";
import { getLogger } from "@/libs/logger";
import { DEFAULT_TAG_POOLS, type TagPool } from "./sources";

const log = getLogger("lets-more-background:storage");

export const TAG_POOLS_STORAGE_NAME = "more_background_tag_pools.json";

let memoryCachedTagPools: TagPool[] | null = null;

/**
 * 从思源工作区独立存储文件 (/data/storage/petal/siyuan-damophus/more_background_tag_pools.json) 读取画师/Tag词库
 * 如果文件尚不存在，自动将完整预设画师数据库写入到该文件中并返回。
 */
export async function loadTagPoolsFromStorage(): Promise<TagPool[]> {
  try {
    const rawData = await plugin.loadData(TAG_POOLS_STORAGE_NAME);
    if (rawData && Array.isArray(rawData) && rawData.length > 0) {
      memoryCachedTagPools = rawData;
      return rawData;
    }
    // 初次启动或为空时，初始化并写入完整预设画师数据库
    memoryCachedTagPools = DEFAULT_TAG_POOLS;
    await saveTagPoolsToStorage(DEFAULT_TAG_POOLS);
    log.info(`Initialized independent tag pools database in ${TAG_POOLS_STORAGE_NAME}`);
    return DEFAULT_TAG_POOLS;
  } catch (e) {
    log.error("Failed to load tag pools from storage, fallback to defaults:", e);
    memoryCachedTagPools = DEFAULT_TAG_POOLS;
    return DEFAULT_TAG_POOLS;
  }
}

/**
 * 独立保存画师与 Tag 词库到思源工作空间数据库
 */
export async function saveTagPoolsToStorage(pools: TagPool[]): Promise<void> {
  try {
    memoryCachedTagPools = pools;
    await plugin.saveData(TAG_POOLS_STORAGE_NAME, pools);
    log.debug(`Saved ${pools.length} tag pools to ${TAG_POOLS_STORAGE_NAME}`);
  } catch (e) {
    log.error("Failed to save tag pools to storage:", e);
  }
}

/**
 * 获取当前内存缓存的词库池（同步访问）
 */
export function getCachedTagPools(): TagPool[] {
  return memoryCachedTagPools || DEFAULT_TAG_POOLS;
}
