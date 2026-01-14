import { invoke } from "@tauri-apps/api/core";

export interface CustomTunnel {
  id: string;
  name: string;
  config_file: string;
  server_addr?: string;
  server_port?: number;
  tunnels: string[];
  tunnel_type?: string;
  local_ip?: string;
  local_port?: number;
  remote_port?: number;
  created_at: string;
}

export class CustomTunnelService {
  /**
   * 保存自定义隧道配置
   */
  async saveCustomTunnel(
    tunnelName: string,
    configContent: string,
  ): Promise<CustomTunnel> {
    return await invoke<CustomTunnel>("save_custom_tunnel", {
      tunnelName,
      configContent,
    });
  }

  /**
   * 获取所有自定义隧道
   */
  async getCustomTunnels(): Promise<CustomTunnel[]> {
    return await invoke<CustomTunnel[]>("get_custom_tunnels");
  }

  /**
   * 删除自定义隧道
   */
  async deleteCustomTunnel(tunnelId: string): Promise<void> {
    await invoke<void>("delete_custom_tunnel", { tunnelId });
  }

  /**
   * 启动自定义隧道
   */
  async startCustomTunnel(tunnelId: string): Promise<string> {
    return await invoke<string>("start_custom_tunnel", { tunnelId });
  }

  /**
   * 停止自定义隧道
   */
  async stopCustomTunnel(tunnelId: string): Promise<string> {
    return await invoke<string>("stop_custom_tunnel", { tunnelId });
  }

  /**
   * 检查自定义隧道是否在运行
   */
  async isCustomTunnelRunning(tunnelId: string): Promise<boolean> {
    try {
      return await invoke<boolean>("is_custom_tunnel_running", { tunnelId });
    } catch {
      return false;
    }
  }
}

// 导出单例
export const customTunnelService = new CustomTunnelService();
