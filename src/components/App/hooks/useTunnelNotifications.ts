import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { fetchTunnels, type Tunnel } from "@/services/api";
import { logStore } from "@/services/logStore";
import type { LogMessage } from "@/services/frpcManager";
import { playTunnelSound } from "@/lib/sound";

export function useTunnelNotifications(activeTab: string) {
  const processedLogsCountRef = useRef(0);
  const notifiedSuccessRef = useRef<Set<number>>(new Set());
  const notifiedErrorRef = useRef<Set<number>>(new Set());
  const successLogAddedRef = useRef<Set<number>>(new Set());
  const tunnelCacheRef = useRef<{
    updatedAt: number;
    data: Map<number, Tunnel>;
  }>({
    updatedAt: 0,
    data: new Map(),
  });

  useEffect(() => {
    const getTunnelById = async (tunnelId: number) => {
      const cache = tunnelCacheRef.current;
      const now = Date.now();
      if (now - cache.updatedAt < 30000 && cache.data.size > 0) {
        return cache.data.get(tunnelId);
      }

      try {
        const tunnels = await fetchTunnels();
        const nextMap = new Map<number, Tunnel>();
        tunnels.forEach((tunnel) => {
          nextMap.set(tunnel.id, tunnel);
        });
        tunnelCacheRef.current = { updatedAt: now, data: nextMap };
        return nextMap.get(tunnelId);
      } catch {
        return cache.data.get(tunnelId);
      }
    };

    const unsubscribe = logStore.subscribe((logs: LogMessage[]) => {
      if (logs.length === 0) return;

      const startIndex = processedLogsCountRef.current;
      if (startIndex >= logs.length) return;

      const newLogs = logs.slice(startIndex);
      processedLogsCountRef.current = logs.length;

      const skipNotifications = activeTab === "tunnels";

      for (const log of newLogs) {
        const tunnelId = log.tunnel_id;
        const message = log.message;
        const hasLauncherSuccessLog = logs.some(
          (item) =>
            item.tunnel_id === tunnelId &&
            item.message.includes("[ChmlFrpLauncher]") &&
            item.message.includes("启动成功"),
        );

        if (message.includes("frpc 进程已启动")) {
          notifiedSuccessRef.current.delete(tunnelId);
          notifiedErrorRef.current.delete(tunnelId);
          successLogAddedRef.current.delete(tunnelId);
        }

        if (message.includes("映射启动成功")) {
          if (
            !hasLauncherSuccessLog &&
            !successLogAddedRef.current.has(tunnelId)
          ) {
            successLogAddedRef.current.add(tunnelId);
            void (async () => {
              const tunnel = await getTunnelById(tunnelId);
              if (!tunnel) {
                return;
              }
              const tunnelType = tunnel.type?.toLowerCase();
              if (tunnelType !== "http" && tunnelType !== "https") {
                return;
              }
              const link = tunnel.dorp || "";
              const tunnelName = tunnel.name || `隧道${tunnelId}`;
              const timestamp = new Date()
                .toLocaleString("zh-CN", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                })
                .replace(/\//g, "/");
              if (link) {
                logStore.addLog({
                  tunnel_id: tunnelId,
                  message: `[I] [ChmlFrpLauncher] 隧道"${tunnelName}"启动成功，您可以通过"${link}"访问。`,
                  timestamp,
                });
              } else {
                logStore.addLog({
                  tunnel_id: tunnelId,
                  message: `[I] [ChmlFrpLauncher] 隧道"${tunnelName}"启动成功。`,
                  timestamp,
                });
              }
            })();
          }
        }

        if (skipNotifications) {
          continue;
        }

        if (message.includes("映射启动成功")) {
          if (!notifiedSuccessRef.current.has(tunnelId)) {
            notifiedSuccessRef.current.add(tunnelId);
            const soundEnabled =
              localStorage.getItem("tunnelSoundEnabled") !== "false";
            playTunnelSound("success", soundEnabled);
            toast.success("隧道启动成功", { duration: 4000 });
          }
        } else if (message.includes("启动失败")) {
          if (!notifiedErrorRef.current.has(tunnelId)) {
            notifiedErrorRef.current.add(tunnelId);
            const soundEnabled =
              localStorage.getItem("tunnelSoundEnabled") !== "false";
            playTunnelSound("error", soundEnabled);
            toast.error("隧道启动失败，请查看日志", { duration: 6000 });
          }
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [activeTab]);
}
