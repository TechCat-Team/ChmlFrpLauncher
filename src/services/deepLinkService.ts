import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";

export interface DeepLinkData {
  tunnelId: number;
  usertoken?: string; // 可选的用户 token
}

export interface DeepLinkHandler {
  (data: DeepLinkData): Promise<void>;
}

class DeepLinkService {
  private unlisten?: UnlistenFn;
  private handler?: DeepLinkHandler;

  /**
   * 启动 deep-link 监听
   * @param handler 处理 deep-link 的回调函数，接收隧道 ID
   */
  async startListening(handler: DeepLinkHandler): Promise<void> {
    if (this.unlisten) {
      // 如果已经在监听，先停止
      this.unlisten();
    }

    this.handler = handler;

    this.unlisten = await listen<string>("deep-link://new-url", async (event) => {
      const url = event.payload;
      try {
        const data = this.parseDeepLink(url);
        if (data !== null && this.handler) {
          await this.handler(data);
        }
      } catch (error) {
        console.error("处理 deep-link 失败:", error);
      }
    });
  }

  /**
   * 停止监听
   */
  stopListening(): void {
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = undefined;
    }
    this.handler = undefined;
  }

  /**
   * 从 URL 中解析 deep-link 数据
   * 支持的格式:
   * - chmlfrp://usertoken/start/{tunnelId} (新格式，带 token)
   * - chmlfrp://start/{tunnelId}
   * - chmlfrp://{tunnelId}
   * - chmlfrp://tunnel/{tunnelId}
   * @param url deep-link URL
   * @returns DeepLinkData，如果解析失败返回 null
   */
  private parseDeepLink(url: string): DeepLinkData | null {
    try {
      // 如果 URL 不包含协议，尝试添加
      let urlToParse = url;
      if (!url.includes("://")) {
        urlToParse = `chmlfrp://${url}`;
      }

      const urlObj = new URL(urlToParse);
      const pathParts = urlObj.pathname.split("/").filter(Boolean);
      
      // 支持新格式: chmlfrp://usertoken/start/{tunnelId}
      if (pathParts.length >= 2 && pathParts[1] === "start") {
        const usertoken = pathParts[0]; // 第一个部分是 token
        const tunnelId = parseInt(pathParts[2], 10);
        if (!isNaN(tunnelId) && tunnelId > 0 && usertoken) {
          return { tunnelId, usertoken };
        }
      }
      
      // 支持格式: chmlfrp://start/{tunnelId} 或 chmlfrp://tunnel/{tunnelId}
      if (pathParts.length > 0) {
        // 如果第一个部分是 "start" 或 "tunnel"，取第二个部分
        if (pathParts[0] === "start" || pathParts[0] === "tunnel") {
          if (pathParts.length > 1) {
            const tunnelId = parseInt(pathParts[1], 10);
            if (!isNaN(tunnelId) && tunnelId > 0) {
              return { tunnelId };
            }
          }
        } else {
          // 否则尝试解析第一个部分
          const tunnelId = parseInt(pathParts[0], 10);
          if (!isNaN(tunnelId) && tunnelId > 0) {
            return { tunnelId };
          }
        }
      }
      
      // 支持直接 chmlfrp://{tunnelId} 格式（hostname 是数字）
      if (urlObj.hostname && !isNaN(parseInt(urlObj.hostname, 10))) {
        const tunnelId = parseInt(urlObj.hostname, 10);
        if (tunnelId > 0) {
          return { tunnelId };
        }
      }
      
      // 尝试从整个 URL 中提取第一个数字
      const match = url.match(/\/(\d+)/);
      if (match) {
        const tunnelId = parseInt(match[1], 10);
        if (tunnelId > 0) {
          return { tunnelId };
        }
      }
      
      // 最后尝试从 hostname 或整个字符串中提取数字
      const numberMatch = url.match(/(\d+)/);
      if (numberMatch) {
        const tunnelId = parseInt(numberMatch[1], 10);
        if (tunnelId > 0) {
          return { tunnelId };
        }
      }
      
      return null;
    } catch (error) {
      // 如果 URL 解析失败，尝试直接从字符串中提取数字
      const numberMatch = url.match(/(\d+)/);
      if (numberMatch) {
        const tunnelId = parseInt(numberMatch[1], 10);
        if (tunnelId > 0) {
          return { tunnelId };
        }
      }
      console.error("解析 deep-link URL 失败:", error, url);
      return null;
    }
  }
}

// 导出单例
export const deepLinkService = new DeepLinkService();

