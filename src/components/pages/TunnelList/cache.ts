import type { TunnelProgress, UnifiedTunnel } from "./types";

export const tunnelListCache = {
  tunnels: [] as UnifiedTunnel[],
  hasLoaded: false,
};

export const tunnelProgressCache = new Map<number, TunnelProgress>();
