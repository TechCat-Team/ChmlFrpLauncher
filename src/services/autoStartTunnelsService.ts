import { invoke } from "@tauri-apps/api/core";

export class AutoStartTunnelsService {
  /**
   * 获取指定隧道的自动启动设置
   * @param tunnelType 隧道类型
   * @param tunnelId 隧道ID
   */
  async isTunnelEnabled(
    tunnelType: string,
    tunnelId: number | string,
  ): Promise<boolean> {
    try {
      const idStr = String(tunnelId);
      return await invoke<boolean>("get_tunnel_auto_start", {
        tunnelType,
        tunnelId: idStr,
      });
    } catch (error) {
      console.error("检查隧道自动启动状态失败:", error);
      return false;
    }
  }

  /**
   * 设置指定隧道的自动启动
   * @param tunnelType 隧道类型
   * @param tunnelId 隧道ID
   * @param enabled 是否启用
   */
  async setTunnelEnabled(
    tunnelType: string,
    tunnelId: number | string,
    enabled: boolean,
  ): Promise<void> {
    try {
      const idStr = String(tunnelId);
      await invoke("set_tunnel_auto_start", {
        tunnelType,
        tunnelId: idStr,
        enabled,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`设置隧道自动启动失败: ${errorMsg}`);
    }
  }

  /**
   * 获取所有自动启动的隧道列表
   * @returns 返回 [(tunnelType, tunnelId), ...] 的列表
   */
  async getAutoStartTunnels(): Promise<Array<[string, string]>> {
    try {
      const result = await invoke<Array<[string, string]>>(
        "get_auto_start_tunnels",
      );
      return result;
    } catch (error) {
      console.error("获取自动启动隧道列表失败:", error);
      return [];
    }
  }

}

export const autoStartTunnelsService = new AutoStartTunnelsService();
