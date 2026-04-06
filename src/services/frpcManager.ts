import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn, type Event } from "@tauri-apps/api/event";
import { getNodeUdpSupport, type Tunnel } from "./api";

export interface LogMessage {
  tunnel_id: number;
  message: string;
  timestamp: string;
}

export interface TunnelConfig {
  tunnel_id: number;
  tunnel_name: string;
  user_token: string;
  server_addr: string;
  server_port: number;
  node_token: string;
  tunnel_type: string;
  local_ip: string;
  local_port: number;
  remote_port?: number;
  custom_domains?: string;
  http_proxy?: string;
  log_level: string;
  force_tls: boolean;
  kcp_optimization: boolean;
}

export class FrpcManager {
  private unlisten?: UnlistenFn;

  private parseRemotePort(rawPort?: string): number | undefined {
    if (!rawPort) return undefined;
    const parsed = Number.parseInt(rawPort, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new Error(`无效的远程端口: ${rawPort}`);
    }
    return parsed;
  }

  async startTunnel(tunnel: Tunnel, userToken: string): Promise<string> {
    // 获取代理配置
    let httpProxy: string | undefined;
    let forceTls = false;
    let kcpOptimization = false;

    try {
      const proxyConfigStr = localStorage.getItem("frpc_proxy_config");
      if (proxyConfigStr) {
        const proxyConfig = JSON.parse(proxyConfigStr);

        // 代理配置
        if (proxyConfig.enabled && proxyConfig.host && proxyConfig.port) {
          const auth =
            proxyConfig.username && proxyConfig.password
              ? `${proxyConfig.username}:${proxyConfig.password}@`
              : "";
          httpProxy = `${proxyConfig.type}://${auth}${proxyConfig.host}:${proxyConfig.port}`;
        }

        // 其他配置
        forceTls = proxyConfig.forceTls || false;
        kcpOptimization = proxyConfig.kcpOptimization || false;
      }
    } catch (error) {
      console.error("解析代理配置失败:", error);
    }

    if (kcpOptimization) {
      const udpSupport = await getNodeUdpSupport(tunnel.node, userToken);
      if (udpSupport !== true) {
        kcpOptimization = false;
      }
    }

    const ipv6OnlyNetwork =
      typeof window !== "undefined" &&
      localStorage.getItem("ipv6OnlyNetwork") === "true";
    const serverAddr = ipv6OnlyNetwork
      ? tunnel.node_ipv6 || ""
      : tunnel.node_ip;

    if (ipv6OnlyNetwork && !tunnel.node_ipv6) {
      throw new Error("此节点无IPV6，您的网络仅支持IPV6");
    }

    const config: TunnelConfig = {
      tunnel_id: tunnel.id,
      tunnel_name: tunnel.name,
      user_token: userToken,
      server_addr: serverAddr,
      server_port: tunnel.server_port,
      node_token: tunnel.node_token,
      tunnel_type: tunnel.type,
      local_ip: tunnel.localip,
      local_port: tunnel.nport,
      remote_port:
        tunnel.type === "tcp" || tunnel.type === "udp"
          ? this.parseRemotePort(tunnel.dorp)
          : undefined,
      custom_domains:
        tunnel.type === "http" || tunnel.type === "https"
          ? tunnel.dorp
          : undefined,
      http_proxy: httpProxy,
      log_level: localStorage.getItem("frpcLogLevel") || "info",
      force_tls: forceTls,
      kcp_optimization: kcpOptimization,
    };

    return await invoke<string>("start_frpc", { config });
  }

  async stopTunnel(tunnelId: number): Promise<string> {
    return await invoke<string>("stop_frpc", {
      tunnelId,
    });
  }

  async isTunnelRunning(tunnelId: number): Promise<boolean> {
    try {
      return await invoke<boolean>("is_frpc_running", {
        tunnelId,
      });
    } catch {
      return false;
    }
  }

  async getRunningTunnels(): Promise<number[]> {
    try {
      return await invoke<number[]>("get_running_tunnels");
    } catch {
      return [];
    }
  }

  async fixFrpcIniTls(): Promise<string> {
    return await invoke<string>("fix_frpc_ini_tls");
  }

  async listenToLogs(onLog: (log: LogMessage) => void): Promise<void> {
    if (this.unlisten) {
      this.unlisten();
    }

    this.unlisten = await listen<LogMessage>(
      "frpc-log",
      (event: Event<LogMessage>) => {
        onLog(event.payload);
      },
    );
  }

  stopListening() {
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = undefined;
    }
  }

  async resolveDomainToIp(domain: string): Promise<string | null> {
    try {
      return await invoke<string | null>("resolve_domain_to_ip", { domain });
    } catch {
      return null;
    }
  }
}

// 导出单例
export const frpcManager = new FrpcManager();
