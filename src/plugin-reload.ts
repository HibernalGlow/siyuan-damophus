export interface PetalToggleResponse {
  code: number;
  msg?: string;
}

export async function reloadPetal(
  toggle: (enabled: boolean) => Promise<PetalToggleResponse>,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<PetalToggleResponse> {
  const disabled = await toggle(false);
  if (disabled.code !== 0) return disabled;
  await wait(180);
  return toggle(true);
}
