import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";

export interface DeepLinkData {
  tunnelId: number;
  usertoken?: string;
}

export interface DeepLinkHandler {
  (data: DeepLinkData): Promise<void>;
}

class DeepLinkService {
  private unlisten?: UnlistenFn;
  private handler?: DeepLinkHandler;

  /**
   * 启动 deep-link 监听
   * @param handler 处理 deep-link 的回调函数
   */
  async startListening(handler: DeepLinkHandler): Promise<void> {
    if (this.unlisten) {
      this.unlisten();
    }

    this.handler = handler;

    this.unlisten = await listen<string>(
      "deep-link://new-url",
      async (event) => {
        const url = event.payload;
        try {
          const data = this.parseDeepLink(url);
          if (data !== null && this.handler) {
            await this.handler(data);
          }
        } catch (error) {
          console.error("处理 deep-link 失败:", error);
        }
      },
    );
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
   * @param url deep-link URL
   * @returns DeepLinkData
   */
  private parseDeepLink(url: string): DeepLinkData | null {
    try {
      let urlToParse = url;
      if (!url.includes("://")) {
        urlToParse = `chmlfrp://${url}`;
      }

      const urlObj = new URL(urlToParse);
      const pathParts = urlObj.pathname.split("/").filter(Boolean);

      if (pathParts.length >= 2 && pathParts[1] === "start") {
        const usertoken = pathParts[0];
        const tunnelId = parseInt(pathParts[2], 10);
        if (!isNaN(tunnelId) && tunnelId > 0 && usertoken) {
          return { tunnelId, usertoken };
        }
      }

      if (pathParts.length > 0) {
        if (pathParts[0] === "start" || pathParts[0] === "tunnel") {
          if (pathParts.length > 1) {
            const tunnelId = parseInt(pathParts[1], 10);
            if (!isNaN(tunnelId) && tunnelId > 0) {
              return { tunnelId };
            }
          }
        } else {
          const tunnelId = parseInt(pathParts[0], 10);
          if (!isNaN(tunnelId) && tunnelId > 0) {
            return { tunnelId };
          }
        }
      }

      if (urlObj.hostname && !isNaN(parseInt(urlObj.hostname, 10))) {
        const tunnelId = parseInt(urlObj.hostname, 10);
        if (tunnelId > 0) {
          return { tunnelId };
        }
      }

      const match = url.match(/\/(\d+)/);
      if (match) {
        const tunnelId = parseInt(match[1], 10);
        if (tunnelId > 0) {
          return { tunnelId };
        }
      }

      const numberMatch = url.match(/(\d+)/);
      if (numberMatch) {
        const tunnelId = parseInt(numberMatch[1], 10);
        if (tunnelId > 0) {
          return { tunnelId };
        }
      }

      return null;
    } catch (error) {
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

export const deepLinkService = new DeepLinkService();
