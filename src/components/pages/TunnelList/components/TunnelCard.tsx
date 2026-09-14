import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Progress } from "@/components/ui/progress";
import { ContextMenuSeparator } from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { deleteTunnel } from "@/services/api";
import { customTunnelService } from "@/services/customTunnelService";
import { autoStartTunnelsService } from "@/services/autoStartTunnelsService";
import type { TunnelProgress, UnifiedTunnel } from "../types";
import { toast } from "sonner";

interface TunnelCardProps {
  tunnel: UnifiedTunnel;
  isRunning: boolean;
  isToggling: boolean;
  progress: TunnelProgress | undefined;
  onToggle: (tunnel: UnifiedTunnel, enabled: boolean) => void;
  onRefresh: () => void;
  onEdit?: (tunnel: UnifiedTunnel) => void;
}

export function TunnelCard({
  tunnel,
  isRunning,
  isToggling,
  progress,
  onToggle,
  onRefresh,
  onEdit,
}: TunnelCardProps) {
  const progressValue = progress?.progress ?? 0;
  const isError = progress?.isError ?? false;
  const isSuccess = progress?.isSuccess ?? false;

  const isCustom = tunnel.type === "custom";
  const isApi = tunnel.type === "api";
  const isNodeOffline = isApi && tunnel.data.nodestate !== "online";

  const extractFirstDomain = (raw?: string) => {
    if (!raw) return "";
    const candidates = raw
      .split(/[,;\s]+/g)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const c of candidates) {
      const m = c.match(/^[A-Za-z0-9.-]+/);
      const domain = (m?.[0] || "").replace(/^\.+|\.+$/g, "");
      if (domain) return domain;
    }
    return "";
  };

  const linkInfo = (() => {
    if (isApi) {
      const typeUpper = tunnel.data.type.toUpperCase();
      const isHttp = typeUpper === "HTTP" || typeUpper === "HTTPS";

      const display = isHttp
        ? `${tunnel.data.dorp}`
        : `${tunnel.data.ip}:${tunnel.data.dorp}`;

      if (!isHttp) return { display, copy: display };

      const protocol = typeUpper === "HTTPS" ? "https" : "http";
      const copy = display.includes("://")
        ? display
        : `${protocol}://${display}`;
      return { display, copy };
    }

    const customType = (tunnel.data.tunnel_type || "").toLowerCase();
    const isHttpCustom = customType === "http" || customType === "https";

    if (isHttpCustom) {
      const firstDomain = extractFirstDomain(tunnel.data.custom_domains);
      const host = firstDomain || tunnel.data.subdomain || "";
      const display = host || tunnel.data.server_addr || "-";

      const protocol = customType === "https" ? "https" : "http";
      const copyHost = display !== "-" ? display : "";
      const copy = copyHost ? `${protocol}://${copyHost}` : `${protocol}://`;
      return { display, copy };
    }

    const port = tunnel.data.remote_port ?? tunnel.data.server_port;
    const addr = tunnel.data.server_addr || "-";
    const display = `${addr}:${port ?? "-"}`;
    return { display, copy: display };
  })();

  const [autoStartEnabled, setAutoStartEnabled] = useState(false);

  useEffect(() => {
    const loadAutoStartSetting = async () => {
      try {
        const tunnelType = isApi ? "api" : "custom";
        const enabled = await autoStartTunnelsService.isTunnelEnabled(
          tunnelType,
          tunnel.data.id,
        );
        setAutoStartEnabled(enabled);
      } catch (error) {
        console.error("加载隧道自动启动设置失败:", error);
      }
    };

    loadAutoStartSetting();
  }, [tunnel, isApi]);

  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setMousePosition(null), []);

  useEffect(() => {
    if (!mousePosition) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [mousePosition, closeMenu]);

  useEffect(() => {
    if (!mousePosition) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [mousePosition, closeMenu]);
  
  useEffect(() => {
    if (!mousePosition) return;

    const preventScroll = (e: WheelEvent) => e.preventDefault();
    const preventTouch = (e: TouchEvent) => e.preventDefault();

    document.addEventListener("wheel", preventScroll, { passive: false });
    document.addEventListener("touchmove", preventTouch, { passive: false });

    return () => {
      document.removeEventListener("wheel", preventScroll);
      document.removeEventListener("touchmove", preventTouch);
    };
  }, [mousePosition]);
  const MENU_WIDTH = 160;

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const menuWidth = MENU_WIDTH;
    const menuHeight = 140;
    const x = e.clientX + menuWidth > window.innerWidth
      ? e.clientX - menuWidth
      : e.clientX;
    const y = e.clientY + menuHeight > window.innerHeight
      ? e.clientY - menuHeight
      : e.clientY;
    setMousePosition({ x, y });
  }, []);

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(linkInfo.copy || "未知");
      toast.success("链接已复制");
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleDelete = async () => {
    try {
      if (isApi) {
        await deleteTunnel(tunnel.data.id);
      } else {
        await customTunnelService.deleteCustomTunnel(tunnel.data.id);
      }
      toast.success("删除成功");
      onRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除隧道失败";
      toast.error(message);
      console.error("删除隧道失败:", error);
    }
  };

  const handleToggleAutoStart = async () => {
    if (isNodeOffline) {
      toast.error("此节点已离线，无法设置自动启动");
      return;
    }
    try {
      const newValue = !autoStartEnabled;
      const tunnelType = isApi ? "api" : "custom";
      await autoStartTunnelsService.setTunnelEnabled(
        tunnelType,
        tunnel.data.id,
        newValue,
      );
      setAutoStartEnabled(newValue);
      toast.success(
        newValue
          ? "已启用：启动软件时自动启动此隧道"
          : "已禁用：此隧道不会自动启动",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "设置失败";
      toast.error(message);
      console.error("设置隧道自动启动失败:", error);
    }
  };

  return (
    <div onContextMenu={handleContextMenu} className="group rounded-lg overflow-hidden transition-all bg-card">
      <div className="w-full bg-muted/20">
        <Progress
          value={progressValue}
          className={`h-0.5 transition-colors ${
            isError
              ? "bg-destructive/20 [&>div]:bg-destructive"
              : isSuccess
                ? "bg-green-500/20 [&>div]:bg-green-500"
                : "opacity-0"
          } ${progressValue > 0 && progressValue < 100 ? "opacity-100" : ""}`}
        />
      </div>
      <div className="p-4">
          <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className="font-semibold text-foreground truncate text-sm">
                {tunnel.data.name}
              </h3>
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  isApi && tunnel.data.nodestate !== "online"
                    ? "bg-red-500"
                    : isRunning
                      ? "bg-foreground"
                      : "bg-muted-foreground/30"
                }`}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded text-muted-foreground bg-muted/10 uppercase tracking-wider">
                {isCustom
                  ? tunnel.data.tunnel_type || "自定义"
                  : tunnel.data.type}
              </span>
              <span className="text-xs text-muted-foreground truncate flex items-center gap-1 opacity-80">
                {isApi ? tunnel.data.node : tunnel.data.server_addr || "-"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isRunning}
                      disabled={isToggling || isNodeOffline}
                      onChange={(e) => onToggle(tunnel, e.target.checked)}
                      className="sr-only peer"
                    />
                    <div
                      className={`w-9 h-5 rounded-full peer transition-colors duration-300 ${
                        isRunning
                          ? "bg-primary"
                          : "bg-muted dark:bg-foreground/12"
                      } ${isToggling || isNodeOffline ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    ></div>
                    <div
                      className={`absolute left-[2px] top-[3px] w-3.5 h-3.5 bg-background rounded-full shadow-sm transition-transform duration-300 ${
                        isRunning ? "translate-x-[18px]" : ""
                      } ${isToggling || isNodeOffline ? "scale-90" : ""}`}
                    ></div>
                  </label>
                </TooltipTrigger>
                {isNodeOffline ? (
                  <TooltipContent side="top" className="text-xs">
                    此节点已离线
                  </TooltipContent>
                ) : null}
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <div className="space-y-2.5 pt-2">
          {isApi ? (
            <>
              <div className="flex items-center justify-between text-xs group/item">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>本地</span>
                </div>
                <span className="font-mono text-foreground/80 selection:bg-foreground/10">
                  {tunnel.data.localip}:{tunnel.data.nport}
                </span>
              </div>
              <div
                className="flex items-center justify-between text-xs cursor-pointer group/link hover:bg-muted/30 -mx-2 px-2 py-1 rounded transition-colors"
                onClick={handleCopyLink}
              >
                <div className="flex items-center gap-2 text-muted-foreground group-hover/link:text-foreground transition-colors">
                  <span>链接</span>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-mono text-foreground/80 truncate max-w-[160px]">
                    {tunnel.data.type.toUpperCase() === "HTTP" ||
                    tunnel.data.type.toUpperCase() === "HTTPS"
                      ? tunnel.data.dorp
                      : `${tunnel.data.ip}:${tunnel.data.dorp}`}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>本地</span>
                </div>
                <span className="font-mono text-foreground/80">
                  {tunnel.data.local_ip || "127.0.0.1"}:
                  {tunnel.data.local_port || "-"}
                </span>
              </div>
              <div
                className="flex items-center justify-between text-xs cursor-pointer group/link hover:bg-muted/30 -mx-2 px-2 py-1 rounded transition-colors"
                onClick={handleCopyLink}
              >
                <div className="flex items-center gap-2 text-muted-foreground group-hover/link:text-foreground transition-colors">
                  <span>链接</span>
                </div>
                <span className="font-mono text-foreground/80 truncate max-w-[160px]">
                  {linkInfo.display}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {mousePosition && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
          style={{ left: mousePosition.x, top: mousePosition.y }}
        >
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    closeMenu();
                    handleToggleAutoStart();
                  }}
                  disabled={isNodeOffline}
                  className={`focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none text-left ${
                    isNodeOffline ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  {autoStartEnabled ? "✓ " : ""}自动启动
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="text-xs">
                  {isNodeOffline
                    ? "此节点已离线，无法设置自动启动"
                    : autoStartEnabled
                      ? "已启用：启动软件时自动启动此隧道"
                      : "未启用：点击可开启启动软件时自动启动此隧道"}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {onEdit && (
            <button
              onClick={() => {
                closeMenu();
                onEdit(tunnel);
              }}
              className="focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-left"
            >
              编辑隧道
            </button>
          )}
          <ContextMenuSeparator />
          <button
            onClick={() => {
              closeMenu();
              handleDelete();
            }}
            className="focus:bg-destructive/10 focus:text-destructive relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none text-destructive data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-left"
          >
            删除隧道
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
