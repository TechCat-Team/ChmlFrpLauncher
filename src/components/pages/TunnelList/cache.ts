import type { Tunnel } from "@/services/api";
import type { TunnelProgress } from "./types";

// 模块级别的缓存，确保在组件卸载后数据仍然保留
export const tunnelListCache = {
  tunnels: [] as Tunnel[],
};

export const tunnelProgressCache = new Map<number, TunnelProgress>();
