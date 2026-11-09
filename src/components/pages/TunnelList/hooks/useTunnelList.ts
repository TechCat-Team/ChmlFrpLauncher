import { useState, useEffect, useRef, useCallback } from "react";
import { fetchTunnels, type Tunnel } from "@/services/api";
import { frpcManager } from "@/services/frpcManager";
import { customTunnelService } from "@/services/customTunnelService";
import { tunnelListCache } from "../cache";
import type { UnifiedTunnel } from "../types";

export function useTunnelList(authKey?: string) {
  const [tunnels, setTunnels] = useState<UnifiedTunnel[]>(
    () => tunnelListCache.tunnels,
  );
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(
    () => !tunnelListCache.hasLoaded,
  );
  const [error, setError] = useState("");
  const [runningTunnels, setRunningTunnels] = useState<Set<string>>(new Set());

  const tunnelsRef = useRef(tunnels);

  useEffect(() => {
    tunnelsRef.current = tunnels;
  }, [tunnels]);

  const checkRunningStatus = useCallback(async (currentTunnels?: UnifiedTunnel[]) => {
    const tunnelsToCheck = currentTunnels || tunnelsRef.current;
    const running = new Set<string>();

    const withTimeout = (promise: Promise<boolean>, timeoutMs: number) =>
      new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), timeoutMs);
        promise
          .then((value) => {
            clearTimeout(timer);
            resolve(value);
          })
          .catch(() => {
            clearTimeout(timer);
            resolve(false);
          });
      });

    await Promise.all(
      tunnelsToCheck.map(async (tunnel) => {
        if (tunnel.type === "api") {
          const isRunning = await withTimeout(
            frpcManager.isTunnelRunning(tunnel.data.id),
            3000,
          );
          if (isRunning) {
            running.add(`api_${tunnel.data.id}`);
          }
        } else {
          const isRunning = await withTimeout(
            customTunnelService.isCustomTunnelRunning(tunnel.data.id),
            3000,
          );
          if (isRunning) {
            running.add(`custom_${tunnel.data.id}`);
          }
        }
      }),
    );

    setRunningTunnels(running);
  }, []);

  const loadTunnels = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [apiResult, customResult] = await Promise.allSettled([
        fetchTunnels(),
        customTunnelService.getCustomTunnels(),
      ]);
      const cachedApiTunnels = tunnelListCache.tunnels.filter(
        (tunnel) => tunnel.type === "api",
      );
      const cachedCustomTunnels = tunnelListCache.tunnels.filter(
        (tunnel) => tunnel.type === "custom",
      );
      const apiTunnels: UnifiedTunnel[] =
        apiResult.status === "fulfilled"
          ? apiResult.value.map((t: Tunnel) => ({ type: "api", data: t }))
          : cachedApiTunnels;
      const customTunnels: UnifiedTunnel[] =
        customResult.status === "fulfilled"
          ? customResult.value.map((t) => ({ type: "custom", data: t }))
          : cachedCustomTunnels;
      const allTunnels = [...apiTunnels, ...customTunnels];

      if (apiResult.status === "rejected") {
        const message =
          apiResult.reason instanceof Error ? apiResult.reason.message : "";
        if (
          message.includes("登录") ||
          message.includes("token") ||
          message.includes("令牌")
        ) {
          setError(message);
        }
      }

      setTunnels(allTunnels);
      tunnelListCache.tunnels = allTunnels;
      tunnelListCache.hasLoaded = true;
      setInitialLoading(false);

      await checkRunningStatus(allTunnels);
    } catch (err) {
      const message = err instanceof Error ? err.message : "获取隧道列表失败";
      if (
        message.includes("登录") ||
        message.includes("token") ||
        message.includes("令牌")
      ) {
        setError(message);
      }
      console.error("获取隧道列表失败", err);
    } finally {
      setInitialLoading(false);
      setLoading(false);
    }
  }, [checkRunningStatus]);

  useEffect(() => {
    loadTunnels();
  }, [authKey, loadTunnels]);

  // 监听守护进程自动重启事件
  useEffect(() => {
    const setupAutoRestartListener = async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const unlisten = await listen<{ tunnel_id: number; timestamp: string }>(
        "tunnel-auto-restarted",
        async () => {
          await checkRunningStatus();
        },
      );

      return unlisten;
    };

    let unlistenFn: (() => void) | undefined;
    setupAutoRestartListener().then((fn) => {
      unlistenFn = fn;
    });

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [checkRunningStatus]);

  // 定期检查运行状态
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkRunningStatus();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkRunningStatus]);
  useEffect(() => {
    let unlistenFn: (() => void) | undefined;

    const setupFocusListener = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        const unlisten = await appWindow.onFocusChanged(({ payload: focused }) => {
          if (focused) {
            checkRunningStatus();
          }
        });
        unlistenFn = unlisten;
      } catch (error) {
        console.error("Failed to setup window focus listener:", error);
      }
    };

    setupFocusListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [checkRunningStatus]);
  useEffect(() => {
    if (tunnels.length === 0) return;

    const interval = setInterval(() => checkRunningStatus(), 5000);

    return () => clearInterval(interval);
  }, [tunnels, checkRunningStatus]);

  return {
    tunnels,
    loading,
    initialLoading,
    error,
    runningTunnels,
    setRunningTunnels,
    refreshTunnels: loadTunnels,
  };
}
