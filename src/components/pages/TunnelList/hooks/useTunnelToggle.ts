import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import type { Tunnel } from "@/services/api";
import { getStoredUser } from "@/services/api";
import { frpcManager } from "@/services/frpcManager";
import type { TunnelProgress } from "../types";
import { tunnelProgressCache } from "../cache";

interface UseTunnelToggleProps {
  setTunnelProgress: Dispatch<
    SetStateAction<Map<number, TunnelProgress>>
  >;
  setRunningTunnels: Dispatch<SetStateAction<Set<number>>>;
  timeoutRefs: React.MutableRefObject<
    Map<number, ReturnType<typeof setTimeout>>
  >;
  successTimeoutRefs: React.MutableRefObject<
    Map<number, ReturnType<typeof setTimeout>>
  >;
}

export function useTunnelToggle({
  setTunnelProgress,
  setRunningTunnels,
  timeoutRefs,
  successTimeoutRefs,
}: UseTunnelToggleProps) {
  const [togglingTunnels, setTogglingTunnels] = useState<Set<number>>(
    new Set(),
  );

  const handleToggle = async (tunnel: Tunnel, enabled: boolean) => {
    const user = getStoredUser();
    if (!user?.usertoken) {
      toast.error("未找到用户令牌，请重新登录");
      return;
    }

    if (togglingTunnels.has(tunnel.id)) {
      return;
    }

    setTogglingTunnels((prev) => new Set(prev).add(tunnel.id));

    try {
      if (enabled) {
        setTunnelProgress((prev) => {
          const next = new Map(prev);
          const resetProgress = {
            progress: 0,
            isError: false,
            isSuccess: false,
          };
          next.set(tunnel.id, resetProgress);
          tunnelProgressCache.set(tunnel.id, resetProgress);
          return next;
        });
        const message = await frpcManager.startTunnel(
          tunnel.id,
          user.usertoken,
        );
        toast.success(message || `隧道 ${tunnel.name} 已启动`);
        setRunningTunnels((prev) => new Set(prev).add(tunnel.id));
      } else {
        const message = await frpcManager.stopTunnel(tunnel.id);
        toast.success(message || `隧道 ${tunnel.name} 已停止`);
        setRunningTunnels((prev) => {
          const next = new Set(prev);
          next.delete(tunnel.id);
          return next;
        });
        setTunnelProgress((prev) => {
          const next = new Map(prev);
          next.set(tunnel.id, {
            progress: 0,
            isError: false,
            isSuccess: false,
          });
          tunnelProgressCache.set(tunnel.id, {
            progress: 0,
            isError: false,
            isSuccess: false,
          });
          return next;
        });
        if (timeoutRefs.current.has(tunnel.id)) {
          clearTimeout(timeoutRefs.current.get(tunnel.id)!);
          timeoutRefs.current.delete(tunnel.id);
        }
        if (successTimeoutRefs.current.has(tunnel.id)) {
          clearTimeout(successTimeoutRefs.current.get(tunnel.id)!);
          successTimeoutRefs.current.delete(tunnel.id);
        }
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : `${enabled ? "启动" : "停止"}失败`;
      toast.error(message);
      if (enabled) {
        const errorProgress = {
          progress: 100,
          isError: true,
          isSuccess: false,
        };
        setTunnelProgress((prev) => {
          const next = new Map(prev);
          next.set(tunnel.id, errorProgress);
          return next;
        });
        tunnelProgressCache.set(tunnel.id, errorProgress);
      }
    } finally {
      setTogglingTunnels((prev) => {
        const next = new Set(prev);
        next.delete(tunnel.id);
        return next;
      });
    }
  };

  return {
    togglingTunnels,
    handleToggle,
  };
}

