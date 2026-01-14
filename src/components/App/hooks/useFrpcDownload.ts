import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { frpcDownloader } from "@/services/frpcDownloader.ts";
import {
  createDownloadInitialToast,
  createDownloadProgressToast,
  createDownloadErrorToast,
} from "../utils/toastHelpers";

let globalDownloadFlag = false;

/**
 * frpc 下载管理 hook
 * 处理 frpc 客户端的自动下载和错误处理
 */
export function useFrpcDownload(): {
  showAntivirusWarning: boolean;
  setShowAntivirusWarning: (value: boolean) => void;
} {
  const downloadToastRef = useRef<string | number | null>(null);
  const isDownloadingRef = useRef(false);
  const [showAntivirusWarning, setShowAntivirusWarning] = useState(false);

  useEffect(() => {
    const checkAndDownloadFrpc = async () => {
      if (globalDownloadFlag || isDownloadingRef.current) {
        return;
      }

      globalDownloadFlag = true;
      isDownloadingRef.current = true;

      try {
        const exists = await frpcDownloader.checkFrpcExists();

        if (exists) {
          globalDownloadFlag = false;
          isDownloadingRef.current = false;
          return;
        }
        downloadToastRef.current = toast.loading(createDownloadInitialToast(), {
          duration: Infinity,
        });

        await frpcDownloader.downloadFrpc((progress) => {
          if (downloadToastRef.current !== null) {
            toast.loading(
              createDownloadProgressToast(
                progress.percentage,
                progress.downloaded,
                progress.total,
              ),
              {
                id: downloadToastRef.current,
                duration: Infinity,
              },
            );
          }
        });

        if (downloadToastRef.current !== null) {
          toast.success("frpc 客户端下载成功", {
            id: downloadToastRef.current,
            duration: 3000,
          });
          downloadToastRef.current = null;
        }
        globalDownloadFlag = false;
        isDownloadingRef.current = false;
      } catch (error) {
        if (downloadToastRef.current !== null) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);

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

          toast.error(createDownloadErrorToast(errorMsg), {
            id: downloadToastRef.current,
            duration: 10000,
          });
          downloadToastRef.current = null;

          if (isWindows && isPossibleAntivirusBlock) {
            setTimeout(() => {
              setShowAntivirusWarning(true);
            }, 500);
          }
        }

        globalDownloadFlag = false;
        isDownloadingRef.current = false;
      }
    };

    checkAndDownloadFrpc();

    return () => {
      frpcDownloader.cleanup();
      if (downloadToastRef.current !== null) {
        toast.dismiss(downloadToastRef.current);
        downloadToastRef.current = null;
      }
    };
  }, []);

  return { showAntivirusWarning, setShowAntivirusWarning };
}
