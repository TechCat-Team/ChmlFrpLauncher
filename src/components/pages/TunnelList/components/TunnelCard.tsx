import { useState, useEffect } from "react";
import { Progress } from "@/components/ui/progress";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
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
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group rounded-xl overflow-hidden transition-all bg-card">
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
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  checked={isRunning}
                  disabled={isToggling}
                  onChange={(e) => onToggle(tunnel, e.target.checked)}
                  className="sr-only peer"
                />
                <div
                  className={`w-9 h-5 bg-muted/50 dark:bg-foreground/12 rounded-full peer peer-checked:bg-foreground transition-all duration-300 ${isToggling ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
                ></div>
                <div
                  className={`absolute left-[2px] top-[2px] w-4 h-4 bg-background rounded-full shadow-sm transition-all duration-300 peer-checked:translate-x-4 ${isToggling ? "scale-90" : ""}`}
                ></div>
              </label>
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
        </div>
      </ContextMenuTrigger>
      <TooltipProvider delayDuration={300}>
        <ContextMenuContent className="w-32">
          <Tooltip>
            <TooltipTrigger asChild>
              <ContextMenuItem
                onClick={handleToggleAutoStart}
                className="text-xs"
              >
                {autoStartEnabled ? "✓ " : ""}自动启动
              </ContextMenuItem>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              <p className="text-xs">
                {autoStartEnabled
                  ? "已启用：启动软件时自动启动此隧道"
                  : "未启用：点击可开启启动软件时自动启动此隧道"}
              </p>
            </TooltipContent>
          </Tooltip>
          {onEdit && (
            <ContextMenuItem onClick={() => onEdit(tunnel)} className="text-xs">
              编辑隧道
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onClick={handleDelete}
            className="text-xs"
          >
            删除隧道
          </ContextMenuItem>
        </ContextMenuContent>
      </TooltipProvider>
    </ContextMenu>
  );
}
