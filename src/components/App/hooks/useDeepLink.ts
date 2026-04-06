import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { deepLinkService, type DeepLinkData } from "@/services/deepLinkService";
import {
  getStoredUser,
  type StoredUser,
  fetchTunnels,
  fetchUserInfo,
  saveStoredUser,
} from "@/services/api";
import { frpcDownloader } from "@/services/frpcDownloader.ts";
import { frpcManager } from "@/services/frpcManager";
import { logStore } from "@/services/logStore";
import {
  createDownloadInitialToast,
  createDownloadProgressToast,
  createDownloadErrorToast,
  createTunnelSuccessToast,
} from "../utils/toastHelpers";

/**
 * Deep Link 处理 hook
 * 处理深度链接启动隧道的逻辑
 */
export function useDeepLink(
  user: StoredUser | null,
  setUser: (user: StoredUser | null) => void,
) {
  const pendingDeepLinkRef = useRef<DeepLinkData | null>(null);
  const isAppReady = true;

  const handleDeepLinkInternal = useCallback(
    async (data: DeepLinkData) => {
      try {
        const currentUser = getStoredUser();
        let tokenToUse = data.usertoken || currentUser?.usertoken;

        if (data.usertoken && !currentUser?.usertoken) {
          toast.loading("正在使用 token 登录...", {
            duration: Infinity,
          });

          try {
            const userInfo = await fetchUserInfo(data.usertoken);

            const newUser: StoredUser = {
              username: userInfo.username,
              usergroup: userInfo.usergroup,
              userimg: userInfo.userimg || null,
              usertoken: data.usertoken,
              tunnelCount: userInfo.tunnelCount,
              tunnel: userInfo.tunnel,
            };

            saveStoredUser(newUser);
            setUser(newUser);
            tokenToUse = data.usertoken;

            toast.dismiss();
            toast.success("登录成功");

            await new Promise((resolve) => setTimeout(resolve, 300));
          } catch (error) {
            toast.dismiss();
            const errorMsg =
              error instanceof Error ? error.message : "登录失败";
            toast.error(`使用 token 登录失败: ${errorMsg}`);
            console.error("Deep-link 登录失败:", error);
            return;
          }
        }

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

        const frpcExists = await frpcDownloader.checkFrpcExists();
        if (!frpcExists) {
          toast.dismiss();
          toast.loading(createDownloadInitialToast(), {
            duration: Infinity,
          });

          try {
            await frpcDownloader.downloadFrpc((progress) => {
              toast.loading(
                createDownloadProgressToast(
                  progress.percentage,
                  progress.downloaded,
                  progress.total,
                ),
                {
                  duration: Infinity,
                },
              );
            });

            toast.dismiss();
            toast.success("frpc 客户端下载成功", {
              duration: 2000,
            });
          } catch (error) {
            toast.dismiss();
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            toast.error(createDownloadErrorToast(errorMsg), {
              duration: 10000,
            });
            return;
          }
        }

        toast.loading(`正在启动隧道 ${tunnel.name}...`, {
          duration: Infinity,
        });

        await frpcManager.startTunnel(tunnel, tokenToUse);

        const isHttpType =
          tunnel.type.toUpperCase() === "HTTP" ||
          tunnel.type.toUpperCase() === "HTTPS";
        const linkAddress = isHttpType
          ? tunnel.dorp
          : `${tunnel.ip}:${tunnel.dorp}`;

        let hasHandledSuccess = false;
        const unsubscribe = logStore.subscribe((logs) => {
          if (hasHandledSuccess) {
            return;
          }

          const successLog = logs.find(
            (log) =>
              log.tunnel_id === data.tunnelId &&
              log.message.includes("映射启动成功"),
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

            unsubscribe();
          }
        });

        setTimeout(() => {
          if (!hasHandledSuccess) {
            unsubscribe();
            toast.dismiss();
            toast.error(`隧道 ${tunnel.name} 启动超时，请检查日志`);
          }
        }, 30000);
      } catch (error) {
        toast.dismiss();
        const errorMsg =
          error instanceof Error ? error.message : "启动隧道失败";
        toast.error(errorMsg);
        console.error("Deep-link 启动隧道失败:", error);
      }
    },
    [setUser],
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
