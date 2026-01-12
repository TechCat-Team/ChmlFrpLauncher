import { useState, useCallback } from "react";
import { toast } from "sonner";
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
      toast.error(`下载失败: ${errorMsg}`, {
        id: toastId,
        duration: 8000,
      });
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

