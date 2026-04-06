import { useState, useEffect, useRef } from "react";
import { fetchTunnels, type Tunnel } from "@/services/api";
import { frpcManager } from "@/services/frpcManager";
import { customTunnelService } from "@/services/customTunnelService";
import { tunnelListCache } from "../cache";
import type { UnifiedTunnel } from "../types";

export function useTunnelList() {
  const [tunnels, setTunnels] = useState<UnifiedTunnel[]>(() => {
    return tunnelListCache.tunnels.map((t) => ({
      type: "api" as const,
      data: t,
    }));
  });
  const [loading, setLoading] = useState(() => {
    return tunnelListCache.tunnels.length === 0;
  });
  const [error, setError] = useState("");
  const [runningTunnels, setRunningTunnels] = useState<Set<string>>(new Set());

  const tunnelsRef = useRef(tunnels);

  useEffect(() => {
    tunnelsRef.current = tunnels;
  }, [tunnels]);

  const loadTunnels = async () => {
    setLoading(true);
    setError("");

    try {
      // 加载API隧道和自定义隧道
      const [apiTunnels, customTunnels] = await Promise.all([
        fetchTunnels().catch(() => [] as Tunnel[]),
        customTunnelService.getCustomTunnels().catch(() => []),
      ]);

      // 转换为统一格式
      const allTunnels: UnifiedTunnel[] = [
        ...apiTunnels.map((t) => ({ type: "api" as const, data: t })),
        ...customTunnels.map((t) => ({ type: "custom" as const, data: t })),
      ];

      setTunnels(allTunnels);
      tunnelListCache.tunnels = apiTunnels;

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
        allTunnels.map(async (tunnel) => {
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
      setLoading(false);
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
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTunnels();
  }, []);

  // 监听守护进程自动重启事件
  useEffect(() => {
    const setupAutoRestartListener = async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const unlisten = await listen<{ tunnel_id: number; timestamp: string }>(
        "tunnel-auto-restarted",
        async () => {
          // 使用ref获取最新的tunnels
          const currentTunnels = tunnelsRef.current;

          // 立即检查所有隧道的运行状态
          const running = new Set<string>();

          for (const tunnel of currentTunnels) {
            if (tunnel.type === "api") {
              const isRunning = await frpcManager.isTunnelRunning(
                tunnel.data.id,
              );
              if (isRunning) {
                running.add(`api_${tunnel.data.id}`);
              }
            } else {
              const isRunning = await customTunnelService.isCustomTunnelRunning(
                tunnel.data.id,
              );
              if (isRunning) {
                running.add(`custom_${tunnel.data.id}`);
              }
            }
          }
          setRunningTunnels(running);
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
  }, []);

  // 定期检查运行状态
  useEffect(() => {
    if (tunnels.length === 0) return;

    const checkRunningStatus = async () => {
      const running = new Set<string>();

      for (const tunnel of tunnels) {
        if (tunnel.type === "api") {
          const isRunning = await frpcManager.isTunnelRunning(tunnel.data.id);
          if (isRunning) {
            running.add(`api_${tunnel.data.id}`);
          }
        } else {
          const isRunning = await customTunnelService.isCustomTunnelRunning(
            tunnel.data.id,
          );
          if (isRunning) {
            running.add(`custom_${tunnel.data.id}`);
          }
        }
      }
      setRunningTunnels(running);
    };

    const interval = setInterval(checkRunningStatus, 5000);

    return () => clearInterval(interval);
  }, [tunnels]);

  return {
    tunnels,
    loading,
    error,
    runningTunnels,
    setRunningTunnels,
    refreshTunnels: loadTunnels,
  };
}
