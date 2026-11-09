import { invoke } from "@tauri-apps/api/core";

export interface PortCheckResult {
  occupied: boolean;
  pid: string | null;
  process: string | null;
}

interface PortOwner {
  pid: string;
  process: string;
}

interface PortListener extends PortOwner {
  port: string;
  protocol?: string;
}

export interface PortUsage {
  port: string;
  protocol: "TCP" | "UDP";
  owners: PortOwner[];
}

const windowsSystemProcesses = new Set([
  "system",
  "system idle process",
  "registry",
  "memory compression",
  "svchost",
  "lsass",
  "lsm",
  "services",
  "csrss",
  "smss",
  "wininit",
  "winlogon",
  "spoolsv",
  "wudfhost",
  "msmpeng",
]);

export async function checkLocalPort(port: string): Promise<PortCheckResult> {
  return invoke<PortCheckResult>("check_local_port", { port });
}

export async function getPorts(): Promise<PortUsage[]> {
  const listeners = await invoke<PortListener[]>("get_ports");
  const isWindows = /^win/i.test(navigator.platform);
  const ports = new Map<string, PortUsage>();

  for (const { port, pid, process, protocol: rawProtocol } of listeners) {
    const protocol = rawProtocol?.toUpperCase().replace(/[46]$/, "");
    if (protocol !== "TCP" && protocol !== "UDP") continue;

    if (
      isWindows &&
      (pid === "0" ||
        pid === "4" ||
        windowsSystemProcesses.has(process.toLowerCase().replace(/\.exe$/, "")))
    ) {
      continue;
    }

    const key = `${port}-${protocol}`;
    const usage = ports.get(key);
    if (!usage) {
      ports.set(key, { port, protocol, owners: [{ pid, process }] });
    } else if (!usage.owners.some((owner) => owner.pid === pid)) {
      usage.owners.push({ pid, process });
    }
  }

  return [...ports.values()];
}
