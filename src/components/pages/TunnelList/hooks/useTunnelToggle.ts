import { useState, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { getStoredUser } from "@/services/api";
import { frpcManager } from "@/services/frpcManager";
import { customTunnelService } from "@/services/customTunnelService";
import type { TunnelProgress, UnifiedTunnel } from "../types";

interface UseTunnelToggleProps {
  setTunnelProgress: Dispatch<SetStateAction<Map<string, TunnelProgress>>>;
  setRunningTunnels: Dispatch<SetStateAction<Set<string>>>;
  timeoutRefs: React.MutableRefObject<
    Map<string, ReturnType<typeof setTimeout>>
  >;
  successTimeoutRefs: React.MutableRefObject<
    Map<string, ReturnType<typeof setTimeout>>
  >;
}

export function useTunnelToggle({
  setTunnelProgress,
  setRunningTunnels,
  timeoutRefs,
  successTimeoutRefs,
}: UseTunnelToggleProps) {
  const [togglingTunnels, setTogglingTunnels] = useState<Set<string>>(
    new Set(),
  );
  const startingTunnelKeyRef = useRef<string | null>(null);

  const handleToggle = async (tunnel: UnifiedTunnel, enabled: boolean) => {
    const tunnelKey =
      tunnel.type === "api"
        ? `api_${tunnel.data.id}`
        : `custom_${tunnel.data.id}`;

    const tunnelName =
      tunnel.type === "api" ? tunnel.data.name : tunnel.data.name;

    if (tunnel.type === "api") {
      const user = getStoredUser();
      if (!user?.usertoken) {
        toast.error("未找到用户令牌，请重新登录");
        return;
      }
    }

    if (togglingTunnels.has(tunnelKey)) {
      return;
    }

    if (enabled && startingTunnelKeyRef.current !== null && startingTunnelKeyRef.current !== tunnelKey) {
      toast.info("请等待当前隧道启动完成后再启动其他隧道", {
        duration: 3000,
      });
      return;
    }

    setTogglingTunnels((prev) => new Set(prev).add(tunnelKey));

    try {
      if (enabled) {
        startingTunnelKeyRef.current = tunnelKey;
        setTunnelProgress((prev) => {
          const next = new Map(prev);
          const resetProgress = {
            progress: 0,
            isError: false,
            isSuccess: false,
          };
          next.set(tunnelKey, resetProgress);
          return next;
        });

        let message: string;
        if (tunnel.type === "api") {
          const user = getStoredUser();
          message = await frpcManager.startTunnel(
            tunnel.data.id,
            user!.usertoken!,
          );
        } else {
          message = await customTunnelService.startCustomTunnel(tunnel.data.id);
          if (startingTunnelKeyRef.current === tunnelKey) {
            startingTunnelKeyRef.current = null;
          }
        }

        toast.success(message || `隧道 ${tunnelName} 已启动`);
        setRunningTunnels((prev) => new Set(prev).add(tunnelKey));
      } else {
        let message: string;
        if (tunnel.type === "api") {
          message = await frpcManager.stopTunnel(tunnel.data.id);
        } else {
          message = await customTunnelService.stopCustomTunnel(tunnel.data.id);
        }

        toast.success(message || `隧道 ${tunnelName} 已停止`);
        setRunningTunnels((prev) => {
          const next = new Set(prev);
          next.delete(tunnelKey);
          return next;
        });
        setTunnelProgress((prev) => {
          const next = new Map(prev);
          next.set(tunnelKey, {
            progress: 0,
            isError: false,
            isSuccess: false,
          });
          return next;
        });
        if (timeoutRefs.current.has(tunnelKey)) {
          clearTimeout(timeoutRefs.current.get(tunnelKey)!);
          timeoutRefs.current.delete(tunnelKey);
        }
        if (successTimeoutRefs.current.has(tunnelKey)) {
          clearTimeout(successTimeoutRefs.current.get(tunnelKey)!);
          successTimeoutRefs.current.delete(tunnelKey);
        }
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : `${enabled ? "启动" : "停止"}失败`;
      toast.error(message);
      if (enabled) {
        if (startingTunnelKeyRef.current === tunnelKey) {
          startingTunnelKeyRef.current = null;
        }
        const errorProgress = {
          progress: 100,
          isError: true,
          isSuccess: false,
        };
        setTunnelProgress((prev) => {
          const next = new Map(prev);
          next.set(tunnelKey, errorProgress);
          return next;
        });
      }
    } finally {
      setTogglingTunnels((prev) => {
        const next = new Set(prev);
        next.delete(tunnelKey);
        return next;
      });
    }
  };

  const clearStartingTunnel = (tunnelKey: string) => {
    if (startingTunnelKeyRef.current === tunnelKey) {
      startingTunnelKeyRef.current = null;
    }
  };

  return {
    togglingTunnels,
    handleToggle,
    clearStartingTunnel,
  };
}
