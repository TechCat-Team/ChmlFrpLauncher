import { Progress } from "@/components/ui/progress";
import type { Tunnel } from "@/services/api";
import type { TunnelProgress } from "../types";

interface TunnelCardProps {
  tunnel: Tunnel;
  isRunning: boolean;
  isToggling: boolean;
  progress: TunnelProgress | undefined;
  onToggle: (tunnel: Tunnel, enabled: boolean) => void;
}

export function TunnelCard({
  tunnel,
  isRunning,
  isToggling,
  progress,
  onToggle,
}: TunnelCardProps) {
  const progressValue = progress?.progress ?? 0;
  const isError = progress?.isError ?? false;
  const isSuccess = progress?.isSuccess ?? false;

  return (
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
                {tunnel.name}
              </h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground uppercase">
                {tunnel.type}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {tunnel.node}
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
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">本地地址</span>
            <span className="font-mono">
              {tunnel.localip}:{tunnel.nport}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">链接地址</span>
            <span className="font-mono">
              {tunnel.ip}:{tunnel.dorp}
            </span>
          </div>

          {tunnel.nodestate && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">节点</span>
              <span
                className={
                  tunnel.nodestate === "online"
                    ? "text-foreground"
                    : "text-muted-foreground"
                }
              >
                {tunnel.nodestate === "online" ? "在线" : "离线"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

