import { Progress } from "@/components/ui/progress";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { deleteTunnel } from "@/services/api";
import { customTunnelService } from "@/services/customTunnelService";
import type { TunnelProgress, UnifiedTunnel } from "../types";
import { toast } from "sonner";
import { Monitor, Globe, Link as LinkIcon, Server } from "lucide-react";

interface TunnelCardProps {
  tunnel: UnifiedTunnel;
  isRunning: boolean;
  isToggling: boolean;
  progress: TunnelProgress | undefined;
  onToggle: (tunnel: UnifiedTunnel, enabled: boolean) => void;
  onRefresh: () => void;
}

export function TunnelCard({
  tunnel,
  isRunning,
  isToggling,
  progress,
  onToggle,
  onRefresh,
}: TunnelCardProps) {
  const progressValue = progress?.progress ?? 0;
  const isError = progress?.isError ?? false;
  const isSuccess = progress?.isSuccess ?? false;

  const isCustom = tunnel.type === "custom";
  const isApi = tunnel.type === "api";

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (isApi) {
        const isHttpType =
          tunnel.data.type.toUpperCase() === "HTTP" ||
          tunnel.data.type.toUpperCase() === "HTTPS";
        const linkAddress = isHttpType
          ? `${tunnel.data.dorp}`
          : `${tunnel.data.ip}:${tunnel.data.dorp}`;
        await navigator.clipboard.writeText(linkAddress);
        toast.success("链接已复制");
      } else {
        const serverAddr = tunnel.data.server_addr || "未知";
        await navigator.clipboard.writeText(serverAddr);
        toast.success("服务器地址已复制");
      }
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

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group border border-border/60 rounded-xl overflow-hidden transition-all bg-card">
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
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground bg-muted/10 uppercase tracking-wider">
                    {isCustom
                      ? tunnel.data.tunnel_type || "自定义"
                      : tunnel.data.type}
                  </span>
                  <span className="text-xs text-muted-foreground truncate flex items-center gap-1 opacity-80">
                    <Server className="w-3 h-3" />
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
                  className={`w-9 h-5 bg-muted/50 rounded-full peer peer-checked:bg-foreground transition-all duration-300 ${isToggling ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
                ></div>
                <div
                  className={`absolute left-[2px] top-[2px] w-4 h-4 bg-background rounded-full shadow-sm transition-all duration-300 peer-checked:translate-x-4 ${isToggling ? "scale-90" : ""}`}
                ></div>
              </label>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-border/30">
              {isApi ? (
                <>
                  <div className="flex items-center justify-between text-xs group/item">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Monitor className="w-3.5 h-3.5 opacity-70" />
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
                      <LinkIcon className="w-3.5 h-3.5 opacity-70" />
                      <span>链接</span>
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono text-foreground/80 truncate max-w-[120px]">
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
                      <Monitor className="w-3.5 h-3.5 opacity-70" />
                      <span>本地</span>
                    </div>
                    <span className="font-mono text-foreground/80">
                      {tunnel.data.local_ip || "127.0.0.1"}:
                      {tunnel.data.local_port || "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Globe className="w-3.5 h-3.5 opacity-70" />
                      <span>远程</span>
                    </div>
                    <span className="font-mono text-foreground/80 truncate">
                      {tunnel.data.server_addr || "-"}:
                      {tunnel.data.remote_port ||
                        tunnel.data.server_port ||
                        "-"}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-32">
        <ContextMenuItem
          variant="destructive"
          onClick={handleDelete}
          className="text-xs"
        >
          删除隧道
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
