import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn, type Event } from "@tauri-apps/api/event";

export interface LogMessage {
  tunnel_id: number;
  message: string;
  timestamp: string;
}

export class FrpcManager {
  private unlisten?: UnlistenFn;

  async startTunnel(tunnelId: number, userToken: string): Promise<string> {
    return await invoke<string>("start_frpc", {
      tunnelId,
      userToken,
    });
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
}

// 导出单例
export const frpcManager = new FrpcManager();
