import { useState, useCallback } from "react";
import { toast } from "sonner";
import { message } from "@tauri-apps/plugin-dialog";
import { frpcDownloader } from "@/services/frpcDownloader";

export interface DownloadProgress {
  percentage: number;
  downloaded: number;
  total: number;
}

export function useFrpcDownload() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);

  const handleRedownloadFrpc = useCallback(async () => {
    if (isDownloading) return;

    setIsDownloading(true);
    setProgress({ percentage: 0, downloaded: 0, total: 0 });
    const toastId = toast.loading("正在下载 frpc 客户端...", {
      duration: Infinity,
    });

    try {
      await frpcDownloader.downloadFrpc((progressData) => {
        setProgress(progressData);
        const downloadedMB = (progressData.downloaded / 1024 / 1024).toFixed(2);
        const totalMB = (progressData.total / 1024 / 1024).toFixed(2);
        toast.loading(
          `正在下载 frpc 客户端... ${progressData.percentage.toFixed(1)}% (${downloadedMB} MB / ${totalMB} MB)`,
          { id: toastId, duration: Infinity },
        );
      });

      toast.success("frpc 客户端下载成功", {
        id: toastId,
        duration: 3000,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // 检测是否可能是 Windows 杀毒软件拦截
      const isWindows =
        typeof navigator !== "undefined" &&
        navigator.userAgent.toLowerCase().includes("windows");
      const isPossibleAntivirusBlock =
        errorMsg.includes("写入文件失败") ||
        errorMsg.includes("无法打开文件") ||
        errorMsg.includes("permission denied") ||
        errorMsg.includes("access denied") ||
        errorMsg.includes("Permission denied") ||
        errorMsg.includes("Access denied");

      toast.error(`下载失败: ${errorMsg}`, {
        id: toastId,
        duration: 8000,
      });

      // 如果是 Windows 系统且可能是杀毒软件拦截，显示友好提示
      if (isWindows && isPossibleAntivirusBlock) {
        setTimeout(async () => {
          await message(
            "下载 frpc 客户端时可能被杀毒软件（如 Windows Defender）拦截。\n\n" +
              "这是由于某些杀毒软件会将 frpc 工具误判为可疑程序。\n\n" +
              "请按以下步骤操作：\n" +
              "1. 打开您的杀毒软件（如 Windows Defender）\n" +
              "2. 在排除项中添加 frpc 的安装目录到白名单\n" +
              "3. 添加白名单后，请重新点击下载按钮\n\n" +
              "如需帮助，请参考 Windows Defender 白名单设置教程。",
            {
              title: "下载被拦截",
              kind: "warning",
            },
          );
        }, 500);
      }
    } finally {
      setIsDownloading(false);
      setProgress(null);
    }
  }, [isDownloading]);

  return {
    isDownloading,
    progress,
    handleRedownloadFrpc,
  };
}
