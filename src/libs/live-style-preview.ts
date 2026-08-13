export interface PreviewSettingItem {
  key: string;
  value: unknown;
}

export function mergeLivePreviewValues(
  settingItems: readonly PreviewSettingItem[],
  overrides: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    ...Object.fromEntries(settingItems.map((item) => [item.key, item.value])),
    ...overrides,
  };
}

export function updateLivePreviewOverride(
  overrides: Readonly<Record<string, unknown>>,
  change: { key: string; value: unknown },
): Record<string, unknown> {
  return { ...overrides, [change.key]: change.value };
}
