import allArtistsData from "./all_artists.json";
import officialTagsData from "./official_tags.json";

export interface TagDefinition {
  tag: string;
  zh: string;
  category?: "artist" | "copyright" | "character" | "scenery" | "style" | "general";
}

// 动态在线翻译缓存（来自网络或运行时动态获取）
const DYNAMIC_TAG_CACHE: Record<string, TagDefinition> = {};

// 初始化读取本地缓存的在线翻译
if (typeof localStorage !== "undefined") {
  try {
    const saved = localStorage.getItem("damophus_dynamic_tag_translations");
    if (saved) {
      Object.assign(DYNAMIC_TAG_CACHE, JSON.parse(saved));
    }
  } catch {}
}

export function saveDynamicTagTranslation(tag: string, zh: string, category: TagDefinition["category"] = "general"): void {
  const clean = tag.trim().toLowerCase().replace(/\s+/g, "_");
  DYNAMIC_TAG_CACHE[clean] = { tag: clean, zh, category };
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem("damophus_dynamic_tag_translations", JSON.stringify(DYNAMIC_TAG_CACHE));
    } catch {}
  }
}

export const COMMON_TAG_DICTIONARY: Record<string, TagDefinition> = {
  // --- 场景与自然环境 (Scenery) ---
  scenery: { tag: "scenery", zh: "唯美风景 / 背景", category: "scenery" },
  landscape: { tag: "landscape", zh: "自然风光 / 大广角", category: "scenery" },
  night_sky: { tag: "night_sky", zh: "璀璨夜空", category: "scenery" },
  cloudy_sky: { tag: "cloudy_sky", zh: "云海晴空", category: "scenery" },
  sunset: { tag: "sunset", zh: "落日余晖 / 晚霞", category: "scenery" },
  sunrise: { tag: "sunrise", zh: "日出朝霞", category: "scenery" },
  sky: { tag: "sky", zh: "天空", category: "scenery" },
  clouds: { tag: "clouds", zh: "白云 / 积雨云", category: "scenery" },
  cumulonimbus: { tag: "cumulonimbus", zh: "积雨云 / 巨云", category: "scenery" },
  stars: { tag: "stars", zh: "繁星 / 星辰", category: "scenery" },
  starry_sky: { tag: "starry_sky", zh: "漫天星河", category: "scenery" },
  milky_way: { tag: "milky_way", zh: "浩瀚银河", category: "scenery" },
  moon: { tag: "moon", zh: "月亮 / 月夜", category: "scenery" },
  full_moon: { tag: "full_moon", zh: "满月 / 圆月", category: "scenery" },
  crescent_moon: { tag: "crescent_moon", zh: "弯月 / 新月", category: "scenery" },
  sunlight: { tag: "sunlight", zh: "丁达尔光 / 暖阳", category: "scenery" },
  sunbeams: { tag: "sunbeams", zh: "穿透光束", category: "scenery" },
  cityscape: { tag: "cityscape", zh: "城市街景", category: "scenery" },
  city: { tag: "city", zh: "都市 / 现代城镇", category: "scenery" },
  tokyo: { tag: "tokyo", zh: "东京街景", category: "scenery" },
  street: { tag: "street", zh: "街道 / 巷口", category: "scenery" },
  ocean: { tag: "ocean", zh: "蔚蓝大海 / 水下", category: "scenery" },
  sea: { tag: "sea", zh: "大海", category: "scenery" },
  beach: { tag: "beach", zh: "海滩 / 海滨", category: "scenery" },
  seaside: { tag: "seaside", zh: "海边 / 沿海", category: "scenery" },
  waves: { tag: "waves", zh: "浪花 / 海浪", category: "scenery" },
  water: { tag: "water", zh: "清澈水景", category: "scenery" },
  underwater: { tag: "underwater", zh: "水下世界 / 深海", category: "scenery" },
  reflection: { tag: "reflection", zh: "水面倒影 / 镜面", category: "scenery" },
  forest: { tag: "forest", zh: "森林秘境", category: "scenery" },
  tree: { tag: "tree", zh: "绿树 / 林木", category: "scenery" },
  trees: { tag: "trees", zh: "树林 / 森林", category: "scenery" },
  grass: { tag: "grass", zh: "草地 / 旷野", category: "scenery" },
  field: { tag: "field", zh: "原野 / 花田", category: "scenery" },
  flower: { tag: "flower", zh: "花卉", category: "scenery" },
  flowers: { tag: "flowers", zh: "百花盛开", category: "scenery" },
  cherry_blossoms: { tag: "cherry_blossoms", zh: "浪漫樱花", category: "scenery" },
  petals: { tag: "petals", zh: "飘落花瓣", category: "scenery" },
  falling_petals: { tag: "falling_petals", zh: "落樱飞舞", category: "scenery" },
  autumn_leaves: { tag: "autumn_leaves", zh: "秋季红叶 / 枫叶", category: "scenery" },
  rain: { tag: "rain", zh: "雨天光影", category: "scenery" },
  puddle: { tag: "puddle", zh: "雨后水洼 / 倒影", category: "scenery" },
  umbrella: { tag: "umbrella", zh: "雨伞", category: "scenery" },
  snow: { tag: "snow", zh: "雪景冬日", category: "scenery" },
  snowing: { tag: "snowing", zh: "飞雪漫天", category: "scenery" },
  winter: { tag: "winter", zh: "冬日氛围", category: "scenery" },
  mountains: { tag: "mountains", zh: "群山壮景", category: "scenery" },
  mountain: { tag: "mountain", zh: "高山 / 远山", category: "scenery" },
  space: { tag: "space", zh: "浩瀚宇宙 / 深空", category: "scenery" },
  planet: { tag: "planet", zh: "行星 / 异星", category: "scenery" },
  aurora: { tag: "aurora", zh: "极光夜空", category: "scenery" },
  architecture: { tag: "architecture", zh: "古典建筑 / 遗迹", category: "scenery" },
  building: { tag: "building", zh: "现代建筑 / 高楼", category: "scenery" },
  ruins: { tag: "ruins", zh: "古代遗迹 / 废墟", category: "scenery" },
  torii: { tag: "torii", zh: "神社鸟居", category: "scenery" },
  shrine: { tag: "shrine", zh: "日式神社", category: "scenery" },
  bridge: { tag: "bridge", zh: "长桥 / 桥梁", category: "scenery" },
  indoors: { tag: "indoors", zh: "室内环境", category: "scenery" },
  room: { tag: "room", zh: "房间 / 居室", category: "scenery" },
  window: { tag: "window", zh: "透光窗边", category: "scenery" },
  outdoors: { tag: "outdoors", zh: "户外全景", category: "scenery" },

  // --- 画风与艺术风格 (Style) ---
  cyberpunk: { tag: "cyberpunk", zh: "赛博朋克", category: "style" },
  traditional_media: { tag: "traditional_media", zh: "手绘质感", category: "style" },
  watercolor: { tag: "watercolor", zh: "水彩风格", category: "style" },
  monochrome: { tag: "monochrome", zh: "黑白光影", category: "style" },
  greyscale: { tag: "greyscale", zh: "灰度色阶", category: "style" },
  fantasy: { tag: "fantasy", zh: "奇幻史诗", category: "style" },
  retro: { tag: "retro", zh: "复古怀旧", category: "style" },
  aesthetic: { tag: "aesthetic", zh: "唯美意境", category: "style" },
  depth_of_field: { tag: "depth_of_field", zh: "景深虚化", category: "style" },
  bokeh: { tag: "bokeh", zh: "光斑光晕", category: "style" },
  lens_flare: { tag: "lens_flare", zh: "镜头光晕", category: "style" },
  highres: { tag: "highres", zh: "超高清 (High-Res)", category: "style" },
  absurdres: { tag: "absurdres", zh: "极高清 (Absurd-Res)", category: "style" },
  wallpaper: { tag: "wallpaper", zh: "高清壁纸", category: "general" },

  // --- 原作与热门 IP (Copyright) ---
  original: { tag: "original", zh: "原创插画作品", category: "copyright" },
  genshin_impact: { tag: "genshin_impact", zh: "原神 (Genshin)", category: "copyright" },
  honkai_star_rail: { tag: "honkai_star_rail", zh: "崩坏：星穹铁道", category: "copyright" },
  honkai_impact_3rd: { tag: "honkai_impact_3rd", zh: "崩坏3", category: "copyright" },
  blue_archive: { tag: "blue_archive", zh: "碧蓝档案", category: "copyright" },
  arknights: { tag: "arknights", zh: "明日方舟", category: "copyright" },
  fate_series: { tag: "fate_series", zh: "Fate 系列", category: "copyright" },
  "fate/grand_order": { tag: "fate/grand_order", zh: "FGO", category: "copyright" },
  touhou: { tag: "touhou", zh: "东方 Project", category: "copyright" },
  azur_lane: { tag: "azur_lane", zh: "碧蓝航线", category: "copyright" },
  hololive: { tag: "hololive", zh: "Hololive", category: "copyright" },
  vocaloid: { tag: "vocaloid", zh: "Vocaloid", category: "copyright" },
  nijisanji: { tag: "nijisanji", zh: "彩虹社", category: "copyright" },
  idolmaster: { tag: "idolmaster", zh: "偶像大师", category: "copyright" },
  pokemon: { tag: "pokemon", zh: "宝可梦", category: "copyright" },
  chainsaw_man: { tag: "chainsaw_man", zh: "电锯人", category: "copyright" },
  jujutsu_kaisen: { tag: "jujutsu_kaisen", zh: "咒术回战", category: "copyright" },
  lycoris_recoil: { tag: "lycoris_recoil", zh: "莉可丽丝", category: "copyright" },
  frieren: { tag: "frieren", zh: "葬送的芙莉莲", category: "copyright" },
  bocchi_the_rock: { tag: "bocchi_the_rock", zh: "孤独摇滚", category: "copyright" },
  code_geass: { tag: "code_geass", zh: "反叛的鲁路修", category: "copyright" },
  urusei_yatsura: { tag: "urusei_yatsura", zh: "福星小子", category: "copyright" },
  evangelion: { tag: "evangelion", zh: "EVA / 新世纪福音战士", category: "copyright" },
  neon_genesis_evangelion: { tag: "neon_genesis_evangelion", zh: "新世纪福音战士", category: "copyright" },
  spy_x_family: { tag: "spy_x_family", zh: "间谍过家家", category: "copyright" },
  re_zero: { tag: "re_zero", zh: "Re:从零开始的异世界生活", category: "copyright" },
  sword_art_online: { tag: "sword_art_online", zh: "刀剑神域", category: "copyright" },
  umamusume: { tag: "umamusume", zh: "赛马娘", category: "copyright" },

  // --- 角色特征与构图 (General / Character) ---
  cc: { tag: "cc", zh: "C.C. (鲁路修)", category: "character" },
  "c.c.": { tag: "c.c.", zh: "C.C. (鲁路修)", category: "character" },
  lum: { tag: "lum", zh: "拉姆 (福星小子)", category: "character" },
  lelouch_lamperouge: { tag: "lelouch_lamperouge", zh: "鲁路修", category: "character" },
  hatsune_miku: { tag: "hatsune_miku", zh: "初音未来", category: "character" },
  rangetsu: { tag: "rangetsu", zh: "岚月 (画师)", category: "artist" },
  "1girl": { tag: "1girl", zh: "单人少女", category: "character" },
  "2girls": { tag: "2girls", zh: "双人少女", category: "character" },
  "3girls": { tag: "3girls", zh: "三人少女", category: "character" },
  "1boy": { tag: "1boy", zh: "单人少年 / 男性", category: "character" },
  solo: { tag: "solo", zh: "单人构图", category: "general" },
  multiple_girls: { tag: "multiple_girls", zh: "多位少女", category: "character" },
  no_humans: { tag: "no_humans", zh: "纯风景/无人物", category: "scenery" },
  looking_at_viewer: { tag: "looking_at_viewer", zh: "注视镜头", category: "general" },
  smile: { tag: "smile", zh: "微笑", category: "general" },
  blush: { tag: "blush", zh: "微红脸颊 / 害羞", category: "general" },
  open_mouth: { tag: "open_mouth", zh: "张嘴", category: "general" },
  closed_eyes: { tag: "closed_eyes", zh: "闭眼 / 沉醉", category: "general" },
  long_hair: { tag: "long_hair", zh: "飘逸长发", category: "character" },
  short_hair: { tag: "short_hair", zh: "利落短发", category: "character" },
  twintails: { tag: "twintails", zh: "双马尾", category: "character" },
  ponytail: { tag: "ponytail", zh: "高马尾", category: "character" },
  black_hair: { tag: "black_hair", zh: "黑发", category: "character" },
  white_hair: { tag: "white_hair", zh: "白发 / 银发", category: "character" },
  silver_hair: { tag: "silver_hair", zh: "银发", category: "character" },
  blonde_hair: { tag: "blonde_hair", zh: "金发", category: "character" },
  brown_hair: { tag: "brown_hair", zh: "棕发 / 栗发", category: "character" },
  blue_hair: { tag: "blue_hair", zh: "蓝发", category: "character" },
  pink_hair: { tag: "pink_hair", zh: "粉发", category: "character" },
  purple_hair: { tag: "purple_hair", zh: "紫发", category: "character" },
  green_hair: { tag: "green_hair", zh: "绿发", category: "character" },
  red_hair: { tag: "red_hair", zh: "红发", category: "character" },
  blue_eyes: { tag: "blue_eyes", zh: "蓝瞳", category: "character" },
  red_eyes: { tag: "red_eyes", zh: "红瞳", category: "character" },
  green_eyes: { tag: "green_eyes", zh: "绿瞳", category: "character" },
  yellow_eyes: { tag: "yellow_eyes", zh: "金瞳 / 琥珀瞳", category: "character" },
  purple_eyes: { tag: "purple_eyes", zh: "紫瞳", category: "character" },
  brown_eyes: { tag: "brown_eyes", zh: "棕瞳", category: "character" },
  heterochromia: { tag: "heterochromia", zh: "异色瞳", category: "character" },
  dress: { tag: "dress", zh: "华丽长裙 / 礼服", category: "character" },
  skirt: { tag: "skirt", zh: "裙子", category: "character" },
  school_uniform: { tag: "school_uniform", zh: "校服 / 水手服", category: "character" },
  serafuku: { tag: "serafuku", zh: "水手服", category: "character" },
  kimono: { tag: "kimono", zh: "和服 / 浴衣", category: "character" },
  yukata: { tag: "yukata", zh: "夏日浴衣", category: "character" },
  bikini: { tag: "bikini", zh: "比基尼泳装", category: "character" },
  bikini_top: { tag: "bikini_top", zh: "比基尼上衣", category: "character" },
  swimsuit: { tag: "swimsuit", zh: "泳装", category: "character" },
  cosplay: { tag: "cosplay", zh: "角色扮演 (Cosplay)", category: "general" },
  thighhighs: { tag: "thighhighs", zh: "过膝袜", category: "character" },
  bare_shoulders: { tag: "bare_shoulders", zh: "露肩", category: "character" },
  cleavage: { tag: "cleavage", zh: "微露事业线", category: "character" },
  navel: { tag: "navel", zh: "露脐", category: "character" },
  hoodie: { tag: "hoodie", zh: "连帽衫 / 卫衣", category: "character" },
  jacket: { tag: "jacket", zh: "夹克外套", category: "character" },
  ribbon: { tag: "ribbon", zh: "丝带 / 蝴蝶结", category: "character" },
  hair_ribbon: { tag: "hair_ribbon", zh: "发带", category: "character" },
  hair_ornament: { tag: "hair_ornament", zh: "精美发饰", category: "character" },
  hat: { tag: "hat", zh: "帽子", category: "character" },
  beret: { tag: "beret", zh: "贝雷帽", category: "character" },
  glasses: { tag: "glasses", zh: "眼镜", category: "character" },
  gloves: { tag: "gloves", zh: "手套", category: "character" },
  wings: { tag: "wings", zh: "羽翼 / 翅膀", category: "character" },
  angel_wings: { tag: "angel_wings", zh: "天使羽翼", category: "character" },
  animal_ears: { tag: "animal_ears", zh: "萌系兽耳", category: "character" },
  cat_ears: { tag: "cat_ears", zh: "猫耳", category: "character" },
  fox_ears: { tag: "fox_ears", zh: "狐耳", category: "character" },
  tail: { tag: "tail", zh: "尾巴", category: "character" },
  standing: { tag: "standing", zh: "站姿", category: "general" },
  sitting: { tag: "sitting", zh: "坐姿", category: "general" },
  lying: { tag: "lying", zh: "躺卧", category: "general" },
  floating: { tag: "floating", zh: "浮空 / 漫游", category: "general" },
  wide_shot: { tag: "wide_shot", zh: "远景 / 全景", category: "style" },
  simple_background: { tag: "simple_background", zh: "简约背景", category: "scenery" },
  white_background: { tag: "white_background", zh: "纯白背景", category: "scenery" },
};

// 自动将 all_artists.json 中的 360+ 画师加载入词典
function initArtistDictionary() {
  if (!allArtistsData || typeof allArtistsData !== "object") return;
  for (const groupKey of Object.keys(allArtistsData)) {
    const list = (allArtistsData as any)[groupKey];
    if (Array.isArray(list)) {
      for (const item of list) {
        if (item.tag && item.zh) {
          const lower = item.tag.toLowerCase();
          if (!COMMON_TAG_DICTIONARY[lower]) {
            COMMON_TAG_DICTIONARY[lower] = {
              tag: item.tag,
              zh: item.zh.includes("画师") ? item.zh : `${item.zh} (画师)`,
              category: "artist",
            };
          }
        }
      }
    }
  }
}

initArtistDictionary();

/**
 * 获取某个 Tag 的详细中英文信息和分类
 */
export function getDetailedTagInfo(rawTag: string): TagDefinition {
  const cleanTag = rawTag.trim().toLowerCase().replace(/\s+/g, "_");

  // 1. 优先从动态网络翻译缓存获取
  if (DYNAMIC_TAG_CACHE[cleanTag]) {
    return DYNAMIC_TAG_CACHE[cleanTag];
  }

  // 2. 优先从 33,600+ 官方动漫与 Booru Tag 官方数据库匹配 (EhTagTranslation Official Release)
  const official =
    (officialTagsData as any)[cleanTag] ||
    (officialTagsData as any)[cleanTag.replace(/_/g, " ")] ||
    (officialTagsData as any)[cleanTag.replace(/\./g, "")] ||
    (officialTagsData as any)[cleanTag.replace(/[\(\)_]/g, "")];

  if (official && Array.isArray(official)) {
    return {
      tag: cleanTag,
      zh: official[0],
      category: official[1] || "general",
    };
  }

  // 3. 从常用精校词典补充匹配
  const exact = COMMON_TAG_DICTIONARY[cleanTag];
  if (exact) {
    return {
      tag: exact.tag || cleanTag,
      zh: exact.zh,
      category: exact.category || "general",
    };
  }

  // 4. 尝试匹配画师格式：ask_(askzy) -> Ask (画师)
  if (cleanTag.includes("(artist)") || cleanTag.endsWith("_(circle)")) {
    const name = cleanTag.split("_")[0];
    return {
      tag: cleanTag,
      zh: `${name.charAt(0).toUpperCase() + name.slice(1)} (画师)`,
      category: "artist",
    };
  }

  // 5. 尝试智能分词翻译
  let guessedZh = cleanTag.replace(/_/g, " ");

  return {
    tag: cleanTag,
    zh: guessedZh,
    category: "general",
  };
}

/**
 * 解析单行输入，支持多种格式：
 * 1. ask_(askzy)
 * 2. ask_(askzy), Ask
 * 3. ask_(askzy) # Ask (画师)
 * 4. @ask (askzy)
 * 5. 唯美风景: scenery
 */
export function parseTagLine(line: string): { tag: string; zh?: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("//")) return null;

  let tag = "";
  let zh: string | undefined;

  if (trimmed.includes("#")) {
    const parts = trimmed.split("#");
    tag = parts[0].trim();
    zh = parts.slice(1).join("#").trim();
  } else if (trimmed.includes(",")) {
    const parts = trimmed.split(",");
    tag = parts[0].trim();
    zh = parts.slice(1).join(",").trim();
  } else if (trimmed.includes("：") || trimmed.includes(":")) {
    const parts = trimmed.split(/[:：]/);
    if (/[\u4e00-\u9fa5]/.test(parts[0])) {
      zh = parts[0].trim();
      tag = parts[1].trim();
    } else {
      tag = parts[0].trim();
      zh = parts[1].trim();
    }
  } else {
    tag = trimmed;
  }

  tag = tag
    .replace(/^[@#]/, "")
    .replace(/\s+/g, "_")
    .toLowerCase();

  if (!zh) {
    const detail = getDetailedTagInfo(tag);
    if (detail && detail.zh !== tag.replace(/_/g, " ")) {
      zh = detail.zh;
    }
  }

  return { tag, zh };
}

/**
 * 格式化为可保存和导出的文本行
 */
export function formatTagLine(tag: string, zh?: string): string {
  if (zh && zh.trim()) {
    return `${tag} # ${zh.trim()}`;
  }
  return tag;
}
