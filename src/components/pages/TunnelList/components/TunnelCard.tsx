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

  const handleCopyLink = async () => {
    try {
      if (isApi) {
        const isHttpType =
          tunnel.data.type.toUpperCase() === "HTTP" ||
          tunnel.data.type.toUpperCase() === "HTTPS";
        const linkAddress = isHttpType
          ? `${tunnel.data.dorp}`
          : `${tunnel.data.ip}:${tunnel.data.dorp}`;
        await navigator.clipboard.writeText(linkAddress);
      } else {
        // 自定义隧道从配置中获取的信息
        const serverAddr = tunnel.data.server_addr || "未知";
        await navigator.clipboard.writeText(serverAddr);
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
        <div className="border border-border/60 rounded-lg overflow-hidden hover:border-foreground/20 transition-colors bg-card">
          <div className="w-full">
            <Progress
              value={progressValue}
              className={`h-1 transition-colors ${
                isError
                  ? "bg-destructive/20 [&>div]:bg-destructive"
                  : isSuccess
                    ? "bg-green-500/20 [&>div]:bg-green-500"
                    : ""
              }`}
            />
          </div>
          <div className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-foreground truncate">
                    {tunnel.data.name}
                  </h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground uppercase">
                    {isCustom
                      ? tunnel.data.tunnel_type || "自定义"
                      : tunnel.data.type}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {isApi ? tunnel.data.node : tunnel.data.server_addr || "-"}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer ml-2">
                <input
                  type="checkbox"
                  checked={isRunning}
                  disabled={isToggling}
                  onChange={(e) => onToggle(tunnel, e.target.checked)}
                  className="sr-only peer"
                />
                <div
                  className={`w-9 h-5 bg-muted rounded-full peer peer-checked:bg-foreground transition-colors ${isToggling ? "opacity-50" : ""}`}
                ></div>
                <div
                  className={`absolute left-[2px] top-[2px] w-4 h-4 bg-background rounded-full transition-transform peer-checked:translate-x-4 ${isToggling ? "opacity-50" : ""}`}
                ></div>
              </label>
            </div>

            <div className="space-y-2 text-xs">
              {isApi ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">本地地址</span>
                    <span className="font-mono">
                      {tunnel.data.localip}:{tunnel.data.nport}
                    </span>
                  </div>
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={handleCopyLink}
                    title="点击复制"
                  >
                    <span className="text-muted-foreground">链接地址</span>
                    <span className="font-mono truncate">
                      {tunnel.data.type.toUpperCase() === "HTTP" ||
                      tunnel.data.type.toUpperCase() === "HTTPS"
                        ? tunnel.data.dorp
                        : `${tunnel.data.ip}:${tunnel.data.dorp}`}
                    </span>
                  </div>
                  {tunnel.data.nodestate && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">节点</span>
                      <span
                        className={
                          tunnel.data.nodestate === "online"
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }
                      >
                        {tunnel.data.nodestate === "online" ? "在线" : "离线"}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">本地地址</span>
                    <span className="font-mono">
                      {tunnel.data.local_ip || "127.0.0.1"}:
                      {tunnel.data.local_port || "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">链接地址</span>
                    <span className="font-mono truncate">
                      {tunnel.data.server_addr || "-"}:
                      {tunnel.data.remote_port ||
                        tunnel.data.server_port ||
                        "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">节点</span>
                    <span className="text-foreground">自定义</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem variant="destructive" onClick={handleDelete}>
          删除隧道
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
