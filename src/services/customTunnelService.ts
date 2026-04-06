import { invoke } from "@tauri-apps/api/core";

export interface CustomTunnel {
  id: string;
  name: string;
  config_file: string;
  server_addr?: string;
  server_port?: number;
  tunnels: string[];
  tunnel_type?: string;
  custom_domains?: string;
  subdomain?: string;
  local_ip?: string;
  local_port?: number;
  remote_port?: number;
  created_at: string;
  hashed_id?: number;
}

export class CustomTunnelService {
  async saveCustomTunnel(
    tunnelName: string,
    configContent: string,
  ): Promise<CustomTunnel[]> {
    return await invoke<CustomTunnel[]>("save_custom_tunnel", {
      tunnelName,
      configContent,
    });
  }

  async getCustomTunnels(): Promise<CustomTunnel[]> {
    return await invoke<CustomTunnel[]>("get_custom_tunnels");
  }

  async getCustomTunnelConfig(tunnelId: string): Promise<string> {
    return await invoke<string>("get_custom_tunnel_config", { tunnelId });
  }

  async deleteCustomTunnel(tunnelId: string): Promise<void> {
    await invoke<void>("delete_custom_tunnel", { tunnelId });
  }

  async updateCustomTunnel(
    tunnelId: string,
    configContent: string,
  ): Promise<CustomTunnel> {
    return await invoke<CustomTunnel>("update_custom_tunnel", {
      tunnelId,
      configContent,
    });
  }

  async startCustomTunnel(tunnelId: string): Promise<string> {
    return await invoke<string>("start_custom_tunnel", { tunnelId });
  }

  async stopCustomTunnel(tunnelId: string): Promise<string> {
    return await invoke<string>("stop_custom_tunnel", { tunnelId });
  }

  async isCustomTunnelRunning(tunnelId: string): Promise<boolean> {
    try {
      return await invoke<boolean>("is_custom_tunnel_running", { tunnelId });
    } catch {
      return false;
    }
  }
}

export const customTunnelService = new CustomTunnelService();
