import { requestStrict } from "@/api";
import type { SiyuanKernelClient } from "./types";

export const siyuanKernelClient: SiyuanKernelClient = {
  request<T>(endpoint: string, payload: unknown): Promise<T> {
    return requestStrict<T>(endpoint, payload);
  },
};
