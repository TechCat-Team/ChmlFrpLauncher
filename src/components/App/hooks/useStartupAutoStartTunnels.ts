import { useEffect, useRef } from "react";
import type { StoredUser } from "@/services/api";
import { fetchTunnels } from "@/services/api";
import { frpcManager } from "@/services/frpcManager";
import { customTunnelService } from "@/services/customTunnelService";
import { autoStartTunnelsService } from "@/services/autoStartTunnelsService";

export function useStartupAutoStartTunnels(user: StoredUser | null) {
  const startedCustomRef = useRef(false);
  const startedApiRef = useRef(false);
  const runningRef = useRef(false);

  useEffect(() => {
    const start = async () => {
      if (runningRef.current) return;
      if (startedCustomRef.current && startedApiRef.current) return;
      runningRef.current = true;

      try {
        const autoStartList = await autoStartTunnelsService.getAutoStartTunnels();
        if (autoStartList.length === 0) {
          startedCustomRef.current = true;
          startedApiRef.current = true;
          return;
        }

        const customTunnelIds = new Set(
          autoStartList
            .filter(([type]) => type === "custom")
            .map(([, tunnelId]) => tunnelId),
        );
        const apiTunnelIds = new Set(
          autoStartList
            .filter(([type]) => type === "api")
            .map(([, tunnelId]) => tunnelId),
        );

        if (!startedCustomRef.current) {
          const customTunnels = await customTunnelService
            .getCustomTunnels()
            .catch(() => []);

          for (const tunnel of customTunnels) {
            if (!customTunnelIds.has(String(tunnel.id))) continue;
            try {
              const isRunning = await customTunnelService
                .isCustomTunnelRunning(tunnel.id)
                .catch(() => false);
              if (isRunning) continue;
              await customTunnelService.startCustomTunnel(tunnel.id);
            } catch (error) {
              console.error(`[自动启动] 自定义隧道 ${tunnel.id} 启动失败:`, error);
            }
          }
          startedCustomRef.current = true;
        }

        if (apiTunnelIds.size === 0) {
          startedApiRef.current = true;
          return;
        }

        const token = user?.usertoken;
        if (!token) {
          return;
        }

        const apiTunnels = await fetchTunnels(token).catch(() => []);
        for (const tunnel of apiTunnels) {
          if (!apiTunnelIds.has(String(tunnel.id))) continue;
          try {
            const isRunning = await frpcManager
              .isTunnelRunning(tunnel.id)
              .catch(() => false);
            if (isRunning) continue;
            await frpcManager.startTunnel(tunnel, token);
          } catch (error) {
            console.error(`[自动启动] API 隧道 ${tunnel.id} 启动失败:`, error);
          }
        }
        startedApiRef.current = true;
      } catch (error) {
        console.error("[自动启动] 启动隧道失败:", error);
      } finally {
        runningRef.current = false;
      }
    };

    start();
  }, [user?.usertoken]);
}
