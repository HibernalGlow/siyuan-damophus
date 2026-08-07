const DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface DeviceIdentityProvider {
  getDeviceId(): string;
}

export function validateDeviceId(deviceId: string): string {
  if (!DEVICE_ID_PATTERN.test(deviceId)) throw new Error("Invalid Damophus device identity");
  return deviceId;
}

export function readSiyuanDeviceId(source: unknown = globalThis): string {
  const value = source as { window?: { siyuan?: { config?: { system?: { id?: unknown } } } } };
  const id = value.window?.siyuan?.config?.system?.id;
  if (typeof id !== "string") throw new Error("SiYuan system device identity is unavailable");
  return validateDeviceId(id);
}

export const siyuanDeviceIdentity: DeviceIdentityProvider = {
  getDeviceId: () => readSiyuanDeviceId(),
};
