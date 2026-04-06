import type { Tunnel } from "@/services/api";
import type { TunnelProgress } from "./types";

export const tunnelListCache = {
  tunnels: [] as Tunnel[],
};

export const tunnelProgressCache = new Map<number, TunnelProgress>();
