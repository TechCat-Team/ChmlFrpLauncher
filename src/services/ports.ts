import { invoke } from "@tauri-apps/api/core";

export interface PortCheckResult {
  occupied: boolean;
  pid: string | null;
  process: string | null;
}

export interface PortUsage {
  port: string;
  pid: string;
  process: string;
  protocol?: string;
}

export async function checkLocalPort(port: string): Promise<PortCheckResult> {
  return invoke<PortCheckResult>("check_local_port", { port });
}

export async function getPorts(): Promise<PortUsage[]> {
  return invoke<PortUsage[]>("get_ports");
}
