export const networkAssetsLocalTabType = "network-assets-local-preview";

export function networkAssetsLocalTabTarget(
  pluginName: string,
  documentId: string,
): { id: string; data: { documentId: string } } {
  return { id: `${pluginName}${networkAssetsLocalTabType}`, data: { documentId } };
}
