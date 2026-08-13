import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { getStoredUser } from "@/services/api";
import { frpcManager } from "@/services/frpcManager";
import { customTunnelService } from "@/services/customTunnelService";
import { logStore } from "@/services/logStore";
import { playTunnelSound } from "@/lib/sound";
import type { TunnelProgress, UnifiedTunnel } from "../types";

// 判断是否为文件缺失错误
function isFileMissingError(error: unknown): boolean {
  const errorMsg = error instanceof Error ? error.message : String(error);
  return (
      errorMsg.includes("ENOENT") ||
      errorMsg.includes("找不到") ||
      errorMsg.includes("No such file") ||
      errorMsg.includes("frpc") ||
      errorMsg.includes("无法启动") ||
      errorMsg.includes("未找到") ||
      errorMsg.includes("系统找不到指定的文件")
  );
}
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
  // 控制弹窗显示状态
  const [showWarningDialog, setShowWarningDialog] = useState(false);

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

    setTogglingTunnels((prev) => new Set(prev).add(tunnelKey));

    try {
      if (enabled) {
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
            tunnel.data,
            user!.usertoken!,
          );
        } else {
          message = await customTunnelService.startCustomTunnel(tunnel.data.id);
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

        const logTunnelId =
          tunnel.type === "api" ? tunnel.data.id : tunnel.data.hashed_id;
        if (typeof logTunnelId === "number" && Number.isFinite(logTunnelId)) {
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
          logStore.addLog({
            tunnel_id: logTunnelId,
            message: `[I] [ChmlFrpLauncher] 隧道"${tunnelName}"已手动停止。`,
            timestamp,
          });
        }

        toast.success(message || `隧道 ${tunnelName} 已停止`);
        const soundEnabled =
          localStorage.getItem("tunnelSoundEnabled") !== "false";
        playTunnelSound("stop", soundEnabled);
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
      // 判断错误类型
      if (enabled && isFileMissingError(err)) {
        // 文件缺失：弹出提示窗，不 toast 错误
        setShowWarningDialog(true);
        // 仍然设置进度为错误
        setTunnelProgress((prev) => {
          const next = new Map(prev);
          next.set(tunnelKey, {
            progress: 100,
            isError: true,
            isSuccess: false,
          });
          return next;
        });
      } else {
        // 其他错误：普通 toast
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
            next.set(tunnelKey, errorProgress);
            return next;
          });
        }
      }
    } finally {
      setTogglingTunnels((prev) => {
        const next = new Set(prev);
        next.delete(tunnelKey);
        return next;
      });
    }
  };

    const closeWarningDialog = () => {
      setShowWarningDialog(false);
    };

    return {
      togglingTunnels,
      handleToggle,
      showWarningDialog,
      closeWarningDialog,
    };
  }
