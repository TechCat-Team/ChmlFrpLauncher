import { invoke } from "@tauri-apps/api/core";

export class AutostartService {
  /**
   * 检查开机自启是否已启用
   */
  async isEnabled(): Promise<boolean> {
    try {
      return await invoke<boolean>("is_autostart_enabled");
    } catch (error) {
      console.error("检查开机自启状态失败:", error);
      return false;
    }
  }

  /**
   * 设置开机自启
   * @param enabled 是否启用
   */
  async setEnabled(enabled: boolean): Promise<void> {
    try {
      await invoke("set_autostart", { enabled });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`设置开机自启失败: ${errorMsg}`);
    }
  }
}

// 导出单例
export const autostartService = new AutostartService();
