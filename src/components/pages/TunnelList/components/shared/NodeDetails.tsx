import type { NodeInfo } from "@/services/api";

// 格式化字节大小
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

interface NodeDetailsProps {
  nodeInfo: NodeInfo | null;
  pingLatency: number | null;
  pinging: boolean;
  pingError: boolean;
}

export function NodeDetails({
  nodeInfo,
  pingLatency,
  pinging,
  pingError,
}: NodeDetailsProps) {
  if (!nodeInfo) {
    return null;
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pr-4">
      <div className="space-y-4 pb-3">
        <div className="relative p-4 sm:p-6 bg-gradient-to-br from-muted/40 to-muted/20 rounded-xl border border-border/50 overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/5 to-transparent rounded-full blur-2xl" />

          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-semibold">
                {nodeInfo.name}
              </h3>
              <div className="flex items-center gap-2 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-background/60 border border-border/40">
                <div
                  className={`w-2 h-2 rounded-full ${
                    nodeInfo.state === "online"
                      ? "bg-emerald-500 animate-pulse"
                      : "bg-red-500"
                  }`}
                />
                <span
                  className={`text-xs font-medium ${
                    nodeInfo.state === "online"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {nodeInfo.state === "online" ? "在线" : "离线"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {pinging ? (
                <div className="flex items-center gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-background/60 border border-border/40">
                  <svg
                    className="animate-spin h-3.5 w-3.5 text-muted-foreground"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span className="text-xs text-muted-foreground">
                    测速中...
                  </span>
                </div>
              ) : pingLatency !== null ? (
                <div className="flex items-center gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-background/60 border border-border/40">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      pingLatency < 50
                        ? "bg-emerald-500"
                        : pingLatency < 100
                          ? "bg-yellow-500"
                          : pingLatency < 200
                            ? "bg-orange-500"
                            : "bg-red-500"
                    }`}
                  />
                  <span className="text-xs font-medium font-mono">
                    {Math.round(pingLatency)}ms
                  </span>
                </div>
              ) : pingError ? (
                <div className="flex items-center gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-background/60 border border-border/40">
                  <div className="w-2 h-2 rounded-full bg-gray-400" />
                  <span className="text-xs text-muted-foreground">
                    无法测速
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-3 sm:gap-y-3.5 text-sm">
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground min-w-[70px] sm:min-w-[90px] text-xs sm:text-sm">
                地区
              </span>
              <span className="font-medium text-xs sm:text-sm">
                {nodeInfo.area}
              </span>
            </div>

            <div className="flex items-center gap-3 sm:col-span-2">
              <span className="text-muted-foreground min-w-[70px] sm:min-w-[90px] text-xs sm:text-sm">
                节点地址
              </span>
              <span className="font-mono text-[10px] sm:text-xs font-medium break-all">
                {nodeInfo.ip} - {nodeInfo.realIp}
              </span>
            </div>

            <div className="flex items-center gap-3 sm:col-span-2">
              <span className="text-muted-foreground min-w-[70px] sm:min-w-[90px] text-xs sm:text-sm">
                可用端口
              </span>
              <span className="font-mono text-[10px] sm:text-xs font-medium">
                {nodeInfo.rport}
              </span>
            </div>

            <div className="flex items-start sm:items-center gap-3 sm:col-span-2">
              <span className="text-muted-foreground min-w-[70px] sm:min-w-[90px] text-xs sm:text-sm pt-0.5 sm:pt-0">
                支持功能
              </span>
              <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                <span
                  className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs whitespace-nowrap ${
                    nodeInfo.fangyu === "true"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : "bg-muted/50 text-muted-foreground border border-border/40"
                  }`}
                >
                  {nodeInfo.fangyu === "true" ? "✓" : "✗"} 防御
                </span>
                <span
                  className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs whitespace-nowrap ${
                    nodeInfo.udp === "true"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : "bg-muted/50 text-muted-foreground border border-border/40"
                  }`}
                >
                  {nodeInfo.udp === "true" ? "✓" : "✗"} UDP
                </span>
                <span
                  className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs whitespace-nowrap ${
                    nodeInfo.web === "yes"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : "bg-muted/50 text-muted-foreground border border-border/40"
                  }`}
                >
                  {nodeInfo.web === "yes" ? "✓" : "✗"} 建站
                </span>
              </div>
            </div>
          </div>

          {nodeInfo.notes && (
            <div className="relative mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-border/50 flex items-start gap-3 text-xs sm:text-sm">
              <span className="text-muted-foreground min-w-[70px] sm:min-w-[90px]">
                备注
              </span>
              <span className="flex-1 text-muted-foreground/80">
                {nodeInfo.notes}
              </span>
            </div>
          )}
        </div>

        {(nodeInfo.load1 !== undefined ||
          nodeInfo.bandwidth_usage_percent !== undefined) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {nodeInfo.load1 !== undefined && (
              <div className="p-3 sm:p-4 bg-gradient-to-br from-muted/30 to-muted/10 rounded-lg border border-border/40">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">
                    系统负载
                  </span>
                  <span className="text-[10px] sm:text-xs font-medium font-mono">
                    {nodeInfo.num_cores ? `${nodeInfo.num_cores} 核心` : ""}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      1分钟
                    </span>
                    <span className="text-sm font-semibold">
                      {nodeInfo.load1.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      5分钟
                    </span>
                    <span className="text-sm font-semibold">
                      {nodeInfo.load5.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {nodeInfo.bandwidth_usage_percent !== undefined && (
              <div className="p-3 sm:p-4 bg-gradient-to-br from-muted/30 to-muted/10 rounded-lg border border-border/40">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="text-xs text-muted-foreground">
                    带宽使用率
                  </span>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-xl sm:text-2xl font-bold">
                    {nodeInfo.bandwidth_usage_percent.toFixed(1)}
                  </span>
                  <span className="text-xs sm:text-sm text-muted-foreground mb-0.5 sm:mb-1">
                    %
                  </span>
                </div>
                <div className="mt-2 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      nodeInfo.bandwidth_usage_percent < 50
                        ? "bg-emerald-500"
                        : nodeInfo.bandwidth_usage_percent < 80
                          ? "bg-yellow-500"
                          : "bg-red-500"
                    }`}
                    style={{
                      width: `${Math.min(nodeInfo.bandwidth_usage_percent, 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {(nodeInfo.totalTrafficIn !== undefined ||
          nodeInfo.totalTrafficOut !== undefined) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="p-3 sm:p-4 bg-gradient-to-br from-blue-500/5 to-transparent rounded-lg border border-border/40">
              <div className="flex items-center gap-2 mb-2">
                <svg
                  className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                  />
                </svg>
                <span className="text-xs text-muted-foreground">入站流量</span>
              </div>
              <span className="text-base sm:text-lg font-semibold">
                {formatBytes(nodeInfo.totalTrafficIn)}
              </span>
            </div>
            <div className="p-3 sm:p-4 bg-gradient-to-br from-emerald-500/5 to-transparent rounded-lg border border-border/40">
              <div className="flex items-center gap-2 mb-2">
                <svg
                  className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                  />
                </svg>
                <span className="text-xs text-muted-foreground">出站流量</span>
              </div>
              <span className="text-base sm:text-lg font-semibold">
                {formatBytes(nodeInfo.totalTrafficOut)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
