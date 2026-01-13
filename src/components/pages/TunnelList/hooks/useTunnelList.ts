import { useState, useEffect } from "react";
import { fetchTunnels, type Tunnel } from "@/services/api";
import { frpcManager } from "@/services/frpcManager";
import { tunnelListCache } from "../cache";

export function useTunnelList() {
  const [tunnels, setTunnels] = useState<Tunnel[]>(() => {
    return tunnelListCache.tunnels;
  });
  const [loading, setLoading] = useState(() => {
    return tunnelListCache.tunnels.length === 0;
  });
  const [error, setError] = useState("");
  const [runningTunnels, setRunningTunnels] = useState<Set<number>>(new Set());

  const loadTunnels = async () => {
    if (tunnelListCache.tunnels.length > 0) {
      setTunnels(tunnelListCache.tunnels);
      setLoading(false);

      const running = new Set<number>();
      for (const tunnel of tunnelListCache.tunnels) {
        const isRunning = await frpcManager.isTunnelRunning(tunnel.id);
        if (isRunning) {
          running.add(tunnel.id);
        }
      }
      setRunningTunnels(running);
    } else {
      setLoading(true);
    }

    setError("");
    try {
      const data = await fetchTunnels();
      setTunnels(data);
      tunnelListCache.tunnels = data;

      const running = new Set<number>();
      for (const tunnel of data) {
        const isRunning = await frpcManager.isTunnelRunning(tunnel.id);
        if (isRunning) {
          running.add(tunnel.id);
        }
      }
      setRunningTunnels(running);
    } catch (err) {
      const message = err instanceof Error ? err.message : "获取隧道列表失败";
      if (
        message.includes("登录") ||
        message.includes("token") ||
        message.includes("令牌")
      ) {
        tunnelListCache.tunnels = [];
        setTunnels([]);
        setError(message);
      } else if (tunnelListCache.tunnels.length === 0) {
        setTunnels([]);
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

  // 定期检查运行状态
  useEffect(() => {
    if (tunnels.length === 0) return;

    const checkRunningStatus = async () => {
      const running = new Set<number>();
      for (const tunnel of tunnels) {
        const isRunning = await frpcManager.isTunnelRunning(tunnel.id);
        if (isRunning) {
          running.add(tunnel.id);
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

