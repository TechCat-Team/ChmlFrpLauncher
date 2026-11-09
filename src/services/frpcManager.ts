import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn, type Event } from "@tauri-apps/api/event";
import { toBoolean, type Tunnel } from "./api";

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
  /** frp 额外参数（对应 API 的 ap 字段） */
  extra_params?: string;
  encryption: boolean;
  compression: boolean;
}

export interface PersistedTunnelInfo {
  tunnel_id: number;
  pid: number;
  tunnel_type: string;
  original_id?: string;
  started_at: string;
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
      }
    } catch (error) {
      console.error("解析代理配置失败:", error);
    }

    const config: TunnelConfig = {
      tunnel_id: tunnel.id,
      tunnel_name: tunnel.name,
      user_token: userToken,
      server_addr: tunnel.node_ip,
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
      extra_params: tunnel.ap ?? undefined,
      encryption: toBoolean(tunnel.encryption),
      compression: toBoolean(tunnel.compression),
    };

    return invoke<string>("start_frpc", { config });
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

  async getPersistedRunningTunnels(): Promise<PersistedTunnelInfo[]> {
    try {
      return await invoke<PersistedTunnelInfo[]>("get_persisted_running_tunnels");
    } catch {
      return [];
    }
  }

  async stopOrphanProcess(tunnelId: number): Promise<string> {
    return await invoke<string>("stop_orphan_process", { tunnelId });
  }

  async isTunnelProcessAlive(tunnelId: number): Promise<boolean> {
    try {
      return await invoke<boolean>("is_tunnel_process_alive", { tunnelId });
    } catch {
      return false;
    }
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
