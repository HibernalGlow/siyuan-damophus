export const imageConverterTabType = "image-converter-batch";

export function imageConverterTabTarget(pluginName: string): {id: string; data: Record<string, never>} {
  return {id: `${pluginName}${imageConverterTabType}`, data: {}};
}
