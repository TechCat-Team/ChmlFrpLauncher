import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn, type Event } from "@tauri-apps/api/event";

export interface DownloadProgress {
  downloaded: number;
  total: number;
  percentage: number;
}

export class FrpcDownloader {
  private unlisten?: UnlistenFn;

  async checkFrpcExists(): Promise<boolean> {
    try {
      return await invoke<boolean>("check_frpc_exists");
    } catch (error) {
      console.error("Failed to check frpc:", error);
      return false;
    }
  }

  async getDownloadUrl(): Promise<string> {
    return await invoke<string>("get_download_url");
  }

  async downloadFrpc(
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<string> {
    if (onProgress) {
      this.unlisten = await listen<DownloadProgress>(
        "download-progress",
        (event: Event<DownloadProgress>) => {
          onProgress(event.payload);
        },
      );
    }

    try {
      const path = await invoke<string>("download_frpc");
      return path;
    } finally {
      if (this.unlisten) {
        this.unlisten();
        this.unlisten = undefined;
      }
    }
  }

  cleanup() {
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = undefined;
    }
  }
}

// 导出单例
export const frpcDownloader = new FrpcDownloader();
