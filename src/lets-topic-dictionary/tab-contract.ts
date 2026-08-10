export const topicDictionaryTabType = "topic-dictionary";
export const topicDictionaryDockType = "damophus-topic-dictionary-dock";

export function topicDictionaryTabTarget(pluginName: string): {id: string; data: Record<string, never>} {
  return {id: `${pluginName}${topicDictionaryTabType}`, data: {}};
}
