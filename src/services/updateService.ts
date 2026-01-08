import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";

export interface UpdateInfo {
  version: string;
  date?: string;
  body?: string;
}

export class UpdateService {
  /**
   * 检查是否有可用更新
   * @returns 如果有更新返回 Update 对象，否则返回 null
   */
  async checkUpdate(): Promise<{
    available: boolean;
    version?: string;
    date?: string;
    body?: string;
  }> {
    try {
      const update = await check({
        headers: {},
      });

      if (update?.available) {
        return {
          available: true,
          version: update.version,
          date: update.date,
          body: update.body,
        };
      }

      return { available: false };
    } catch (error) {
      console.error("检查更新失败:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`检查更新失败: ${errorMsg}`);
    }
  }

  /**
   * 安装更新
   */
  async installUpdate(): Promise<void> {
    try {
      const update = await check({
        headers: {},
      });

      if (update?.available) {
        await update.downloadAndInstall((progressEvent: DownloadEvent) => {
          console.log("更新进度:", progressEvent);
        });
      } else {
        throw new Error("没有可用的更新");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`安装更新失败: ${errorMsg}`);
    }
  }

  /**
   * 获取自动检测更新设置
   */
  getAutoCheckEnabled(): boolean {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("autoCheckUpdate");
    return stored !== "false"; // 默认为 true
  }

  /**
   * 设置自动检测更新
   */
  setAutoCheckEnabled(enabled: boolean): void {
    if (typeof window === "undefined") return;
    localStorage.setItem("autoCheckUpdate", enabled ? "true" : "false");
  }

  /**
   * 获取当前应用版本
   */
  async getCurrentVersion(): Promise<string> {
    try {
      return await getVersion();
    } catch (error) {
      console.error("获取版本失败:", error);
      return "未知";
    }
  }
}

export const updateService = new UpdateService();
