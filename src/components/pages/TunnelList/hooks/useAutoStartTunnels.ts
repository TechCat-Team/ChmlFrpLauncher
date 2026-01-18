import { useEffect, useRef } from "react";
import { autoStartTunnelsService } from "@/services/autoStartTunnelsService";
import { getStoredUser } from "@/services/api";
import type { UnifiedTunnel } from "../types";

interface UseAutoStartTunnelsProps {
  tunnels: UnifiedTunnel[];
  loading: boolean;
  runningTunnels: Set<string>;
  onToggle: (tunnel: UnifiedTunnel, enabled: boolean) => void;
}

/**
 * 自动启动隧道 hook
 * 在应用启动时，如果启用了自动启动设置，则启动所有隧道
 */
export function useAutoStartTunnels({
  tunnels,
  loading,
  runningTunnels,
  onToggle,
}: UseAutoStartTunnelsProps) {
  const hasAutoStartedRef = useRef(false);
  const tunnelsRef = useRef(tunnels);
  const runningTunnelsRef = useRef(runningTunnels);
  const onToggleRef = useRef(onToggle);

  useEffect(() => {
    tunnelsRef.current = tunnels;
  }, [tunnels]);

  useEffect(() => {
    runningTunnelsRef.current = runningTunnels;
  }, [runningTunnels]);

  useEffect(() => {
    onToggleRef.current = onToggle;
  }, [onToggle]);

  useEffect(() => {
    // 只在应用启动时执行一次
    if (hasAutoStartedRef.current) {
      return;
    }

    // 等待隧道列表加载完成
    if (loading || tunnels.length === 0) {
      return;
    }

    const autoStart = async () => {
      try {
        // 获取所有标记了自动启动的隧道列表
        const autoStartList =
          await autoStartTunnelsService.getAutoStartTunnels();
        if (autoStartList.length === 0) {
          hasAutoStartedRef.current = true;
          return;
        }

        // 检查是否有用户登录（对于 API 隧道）
        const user = getStoredUser();
        const currentTunnels = tunnelsRef.current;
        const hasApiTunnels = autoStartList.some(([type]) => type === "api");

        if (hasApiTunnels && !user?.usertoken) {
          console.log("[自动启动] 需要登录才能启动 API 隧道");
          hasAutoStartedRef.current = true;
          return;
        }

        const autoStartSet = new Set<string>();
        for (const [tunnelType, tunnelId] of autoStartList) {
          autoStartSet.add(`${tunnelType}_${tunnelId}`);
        }

        // 延迟一下，确保界面已完全加载
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // 只启动标记了自动启动的隧道
        const currentRunningTunnels = runningTunnelsRef.current;
        const toggle = onToggleRef.current;

        for (const tunnel of currentTunnels) {
          const tunnelKey =
            tunnel.type === "api"
              ? `api_${tunnel.data.id}`
              : `custom_${tunnel.data.id}`;

          // 如果隧道没有标记自动启动，跳过
          if (!autoStartSet.has(tunnelKey)) {
            continue;
          }

          // 如果隧道已经在运行，跳过
          if (currentRunningTunnels.has(tunnelKey)) {
            continue;
          }

          // 启动隧道（异步执行，不等待完成）
          toggle(tunnel, true);

          // 在每个隧道之间添加小延迟，避免同时启动太多隧道
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        hasAutoStartedRef.current = true;
        console.log(
          `[自动启动] 已尝试启动 ${autoStartList.length} 个标记了自动启动的隧道`,
        );
      } catch (error) {
        console.error("[自动启动] 启动隧道失败:", error);
        hasAutoStartedRef.current = true; // 即使出错也标记为已执行，避免重复尝试
      }
    };

    autoStart();
  }, [loading, tunnels.length]);
}
