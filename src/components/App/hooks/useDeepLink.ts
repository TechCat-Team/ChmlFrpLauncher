import { isFrpProxyReady } from "@/services/frpLog";
import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { deepLinkService, type DeepLinkData } from "@/services/deepLinkService";
import { getStoredUser, type StoredUser, fetchTunnels } from "@/services/api";
import { frpcManager } from "@/services/frpcManager";
import { logStore } from "@/services/logStore";
import {
  createTunnelSuccessToast,
} from "../utils/toastHelpers";

/**
 * Deep Link 处理 hook
 * 处理深度链接启动隧道的逻辑
 */
export function useDeepLink(user: StoredUser | null) {
  const pendingDeepLinkRef = useRef<DeepLinkData | null>(null);
  const isAppReady = true;

  const handleDeepLinkInternal = useCallback(
    async (data: DeepLinkData) => {
      try {
        const currentUser = getStoredUser();
        const tokenToUse = currentUser?.usertoken;

        if (!tokenToUse) {
          toast.error("请先登录账户");
          return;
        }

        const tunnels = await fetchTunnels(tokenToUse);
        const tunnel = tunnels.find((t) => t.id === data.tunnelId);

        if (!tunnel) {
          toast.error(
            `未找到 ID 为 ${data.tunnelId} 的隧道，或该隧道不属于当前用户`,
          );
          return;
        }

        const isRunning = await frpcManager.isTunnelRunning(data.tunnelId);
        if (isRunning) {
          toast.info(`隧道 ${tunnel.name} 已在运行中`);
          return;
        }

        toast.loading(`正在启动隧道 ${tunnel.name}...`, {
          duration: Infinity,
        });

        const priorLogs = new Set(logStore.getLogs());
        await frpcManager.startTunnel(tunnel, tokenToUse);

        const isHttpType =
          tunnel.type.toUpperCase() === "HTTP" ||
          tunnel.type.toUpperCase() === "HTTPS";
        const linkAddress = isHttpType
          ? tunnel.dorp
          : `${tunnel.ip}:${tunnel.dorp}`;

        let hasHandledSuccess = false;
        let unsubscribe: (() => void) | undefined;
        // subscribe 会同步调用监听器，监听器内要访问 unsubscribe，所以必须用 let 先声明
        // eslint-disable-next-line prefer-const
        unsubscribe = logStore.subscribe((logs) => {
          if (hasHandledSuccess) {
            return;
          }

          const successLog = logs.find(
            (log) =>
              !priorLogs.has(log) &&
              log.tunnel_id === data.tunnelId &&
              isFrpProxyReady(log.message),
          );

          if (successLog) {
            hasHandledSuccess = true;

            toast.dismiss();
            toast.success(
              createTunnelSuccessToast(tunnel.name, linkAddress, async () => {
                try {
                  await navigator.clipboard.writeText(linkAddress);
                  toast.success("链接地址已复制到剪贴板");
                } catch {
                  toast.error("复制失败");
                }
              }),
              {
                duration: 10000,
              },
            );

            unsubscribe?.();
          }
        });

        if (hasHandledSuccess) {
          unsubscribe();
          return;
        }

        setTimeout(() => {
          if (!hasHandledSuccess) {
            unsubscribe?.();
            toast.dismiss();
            toast.error(`隧道 ${tunnel.name} 启动超时，请检查日志`);
          }
        }, 30000);
      } catch (error) {
        toast.dismiss();
        const errorMsg =
          error instanceof Error ? error.message : String(error);
        toast.error(errorMsg);
        console.error("Deep-link 启动隧道失败:", error);
      }
    },
    [],
  );

  useEffect(() => {
    const wrappedHandler = async (data: DeepLinkData) => {
      if (!isAppReady) {
        pendingDeepLinkRef.current = data;
        return;
      }

      await handleDeepLinkInternal(data);
    };

    deepLinkService.startListening(wrappedHandler);

    return () => {
      deepLinkService.stopListening();
    };
  }, [handleDeepLinkInternal, isAppReady]);

  useEffect(() => {
    if (isAppReady && pendingDeepLinkRef.current && user?.usertoken) {
      const pendingData = pendingDeepLinkRef.current;
      pendingDeepLinkRef.current = null;
      setTimeout(() => {
        handleDeepLinkInternal(pendingData);
      }, 500);
    }
  }, [user?.usertoken, handleDeepLinkInternal, isAppReady]);

  return { isAppReady };
}
