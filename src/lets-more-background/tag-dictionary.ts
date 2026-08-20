export interface TagDefinition {
  tag: string;
  zh: string;
  category?: "artist" | "scenery" | "character" | "style" | "general";
}

export const COMMON_TAG_DICTIONARY: Record<string, TagDefinition> = {
  // 画师部分
  "ask_(askzy)": { tag: "ask_(askzy)", zh: "Ask (画师)", category: "artist" },
  "blade_(galaxist)": { tag: "blade_(galaxist)", zh: "Blade (画师)", category: "artist" },
  chomoran: { tag: "chomoran", zh: "朝仓 (画师)", category: "artist" },
  gsusart: { tag: "gsusart", zh: "GsusArt (画师)", category: "artist" },
  henreader: { tag: "henreader", zh: "Henreader (画师)", category: "artist" },
  mignon: { tag: "mignon", zh: "Mignon (画师)", category: "artist" },
  "parsley-f": { tag: "parsley-f", zh: "Parsley (画师)", category: "artist" },
  fkey: { tag: "fkey", zh: "FKEY (画师)", category: "artist" },
  "kaedeko_(kaedelic)": { tag: "kaedeko_(kaedelic)", zh: "枫子 (画师)", category: "artist" },
  kedama_milk: { tag: "kedama_milk", zh: "毛玉牛乳 (画师)", category: "artist" },
  starshadowmagician: { tag: "starshadowmagician", zh: "星影魔术师 (画师)", category: "artist" },
  anmi: { tag: "anmi", zh: "Anmi (画师)", category: "artist" },
  cogecha: { tag: "cogecha", zh: "焦茶 (画师)", category: "artist" },
  tiv: { tag: "tiv", zh: "Tiv (画师)", category: "artist" },
  wlop: { tag: "wlop", zh: "WLOP (画师)", category: "artist" },
  mika_pikazo: { tag: "mika_pikazo", zh: "Mika Pikazo (画师)", category: "artist" },
  reDrop: { tag: "reDrop", zh: "ReDrop (画师)", category: "artist" },
  lack: { tag: "lack", zh: "Lack (画师)", category: "artist" },
  neco: { tag: "neco", zh: "Neco (画师)", category: "artist" },
  "ryota-h": { tag: "ryota-h", zh: "Ryota-H (画师)", category: "artist" },
  krenz: { tag: "krenz", zh: "Krenz Cushart (画师)", category: "artist" },
  huke: { tag: "huke", zh: "Huke (画师)", category: "artist" },
  rurudo: { tag: "rurudo", zh: "Rurudo (画师)", category: "artist" },

  // 场景与意境
  scenery: { tag: "scenery", zh: "唯美风景 / 背景", category: "scenery" },
  night_sky: { tag: "night_sky", zh: "璀璨夜空", category: "scenery" },
  cloudy_sky: { tag: "cloudy_sky", zh: "云海天空", category: "scenery" },
  sunset: { tag: "sunset", zh: "落日余晖 / 晚霞", category: "scenery" },
  cityscape: { tag: "cityscape", zh: "城市街景", category: "scenery" },
  cyberpunk: { tag: "cyberpunk", zh: "赛博朋克", category: "style" },
  cherry_blossoms: { tag: "cherry_blossoms", zh: "浪漫樱花", category: "scenery" },
  landscape: { tag: "landscape", zh: "自然风光 / 大广角", category: "scenery" },
  wallpaper: { tag: "wallpaper", zh: "高清壁纸", category: "general" },
  space: { tag: "space", zh: "浩瀚宇宙 / 深空", category: "scenery" },
  ocean: { tag: "ocean", zh: "蔚蓝大海 / 水下", category: "scenery" },
  forest: { tag: "forest", zh: "森林秘境", category: "scenery" },
  mountains: { tag: "mountains", zh: "群山壮景", category: "scenery" },
  traditional_media: { tag: "traditional_media", zh: "手绘质感", category: "style" },
  watercolor: { tag: "watercolor", zh: "水彩风格", category: "style" },
  monochrome: { tag: "monochrome", zh: "黑白光影", category: "style" },
  fantasy: { tag: "fantasy", zh: "奇幻史诗", category: "style" },
  aurora: { tag: "aurora", zh: "极光夜空", category: "scenery" },
  rain: { tag: "rain", zh: "雨天光影", category: "scenery" },
  snow: { tag: "snow", zh: "雪景冬日", category: "scenery" },
  architecture: { tag: "architecture", zh: "古典建筑 / 遗迹", category: "scenery" },
  sunlight: { tag: "sunlight", zh: "丁达尔光 / 暖阳", category: "scenery" },
};

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

  // 规范化 tag 格式
  tag = tag
    .replace(/^[@#]/, "")
    .replace(/\s+/g, "_")
    .toLowerCase();

  // 如果没有中文，尝试从内置词典匹配
  if (!zh) {
    const dict = COMMON_TAG_DICTIONARY[tag] || COMMON_TAG_DICTIONARY[tag.toLowerCase()];
    if (dict) {
      zh = dict.zh;
    } else {
      // 智能猜测画师名，例如 ask_(askzy) -> Ask
      const match = tag.match(/^([a-zA-Z0-9]+)_/);
      if (match && match[1].length > 1) {
        const capitalized = match[1].charAt(0).toUpperCase() + match[1].slice(1);
        zh = `${capitalized} (画师)`;
      }
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
