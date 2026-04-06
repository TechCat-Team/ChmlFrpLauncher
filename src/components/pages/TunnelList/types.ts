import type { Tunnel } from "@/services/api";
import type { CustomTunnel } from "@/services/customTunnelService";

export interface TunnelProgress {
  progress: number;
  isError: boolean;
  isSuccess: boolean;
  startTime?: number;
}

export type UnifiedTunnel =
  | { type: "api"; data: Tunnel }
  | { type: "custom"; data: CustomTunnel };
