export interface BookmarkPresetTag {
  key: "classic" | "trap" | "hard" | "cramming";
  icon: string;
  defaultLabel: string;
}

/** Preset bookmark tags shared by the bookmark modal and the statistics bookmark card. */
export const BOOKMARK_PRESET_TAGS: readonly BookmarkPresetTag[] = [
  { key: "classic", icon: "⭐️", defaultLabel: "经典好题" },
  { key: "trap", icon: "⚠️", defaultLabel: "易混陷阱" },
  { key: "hard", icon: "🔥", defaultLabel: "重难点" },
  { key: "cramming", icon: "📌", defaultLabel: "考前必刷" },
];
