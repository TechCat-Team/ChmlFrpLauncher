import type { Tunnel } from "@/services/api";
import type { CustomTunnel } from "@/services/customTunnelService";

export interface TunnelProgress {
  progress: number; // 0-100
  isError: boolean; // 是否错误状态（红色）
  isSuccess: boolean; // 是否成功状态（绿色）
  startTime?: number; // 启动时间戳
}

// 统一的隧道类型，包含API隧道和自定义隧道
export type UnifiedTunnel =
  | { type: "api"; data: Tunnel }
  | { type: "custom"; data: CustomTunnel };
