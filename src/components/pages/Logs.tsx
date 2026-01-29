import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select } from "@/components/ui/select";
import { fetchTunnels, type Tunnel } from "@/services/api";
import { frpcManager, type LogMessage } from "@/services/frpcManager";
import { logStore } from "@/services/logStore";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { updateService } from "@/services/updateService";

export function Logs() {
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [selectedTunnelId, setSelectedTunnelId] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const hasAutoSelectedRef = useRef(false);

  useEffect(() => {
    const loadTunnels = async () => {
      try {
        const data = await fetchTunnels();
        setTunnels(data);

        const runningTunnels = await frpcManager.getRunningTunnels();
        if (runningTunnels.length > 0) {
          setSelectedTunnelId(runningTunnels[0]);
        }
      } catch (err) {
        console.error("Failed to load tunnels:", err);
      }
    };

    loadTunnels();
  }, []);

  useEffect(() => {
    const unsubscribe = logStore.subscribe((allLogs) => {
      setLogs(allLogs);

      if (!hasAutoSelectedRef.current && allLogs.length > 0) {
        const firstTunnelId = allLogs[allLogs.length - 1].tunnel_id;
        setSelectedTunnelId(firstTunnelId);
        hasAutoSelectedRef.current = true;
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  // 清空日志
  const handleClearLogs = () => {
    logStore.clearLogs();
    toast.success("日志已清空");
  };

  const handleSaveLogs = async () => {
    // 在函数内部重新计算 filteredLogs，确保使用最新的值
    const logsToSave = selectedTunnelId
      ? logs.filter((log) => log.tunnel_id === selectedTunnelId)
      : logs;

    if (logsToSave.length === 0) {
      toast.error("没有日志可保存");
      return;
    }

    try {
      const filePath = await save({
        defaultPath: `frpc-logs-${selectedTunnelId || "all"}-${new Date().toISOString().slice(0, 10)}.txt`,
        filters: [
          {
            name: "Text",
            extensions: ["txt"],
          },
        ],
      });

      if (filePath) {
        // 生成日志头部信息
        const now = new Date();
        const saveTime = now.toLocaleString("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

        // 获取系统信息
        const appVersion = await updateService
          .getCurrentVersion()
          .catch(() => "未知");

        // 使用浏览器 API 获取系统信息
        const userAgent = navigator.userAgent;
        let osPlatform = "未知";
        let osArch = "未知";

        if (userAgent.includes("Win")) {
          osPlatform = "Windows";
          osArch =
            userAgent.includes("WOW64") || userAgent.includes("x64")
              ? "x64"
              : "x86";
        } else if (userAgent.includes("Mac")) {
          osPlatform = "macOS";
          osArch = userAgent.includes("Intel") ? "x64" : "ARM64";
        } else if (userAgent.includes("Linux")) {
          osPlatform = "Linux";
          osArch = userAgent.includes("x86_64") ? "x64" : "未知";
        } else if (userAgent.includes("Android")) {
          osPlatform = "Android";
        } else if (userAgent.includes("iOS")) {
          osPlatform = "iOS";
        }

        // 获取隧道信息
        const selectedTunnel = selectedTunnelId
          ? tunnels.find((t) => t.id === selectedTunnelId)
          : null;

        // 计算日志时间范围
        const logTimes = logsToSave.map((log) => log.timestamp);
        const firstLogTime = logTimes[0] || "未知";
        const lastLogTime = logTimes[logTimes.length - 1] || "未知";

        // 统计各隧道的日志数量
        const tunnelLogCounts = new Map<number, number>();
        logsToSave.forEach((log) => {
          tunnelLogCounts.set(
            log.tunnel_id,
            (tunnelLogCounts.get(log.tunnel_id) || 0) + 1,
          );
        });

        // 构建头部信息
        const headerLines: (string | null)[] = [
          "———ChmlFrpLauncherLog———",
          `版本: ${appVersion} | 系统: ${osPlatform} ${osArch} | 保存时间: ${saveTime}`,
          selectedTunnel
            ? `隧道: ${selectedTunnel.id} (${selectedTunnel.name}) | 类型: ${selectedTunnel.type || "未知"} | 节点: ${selectedTunnel.node || "未知"}`
            : `模式: 所有隧道 | 涉及: ${tunnelLogCounts.size} 个隧道`,
          selectedTunnel && selectedTunnel.localip && selectedTunnel.nport
            ? `本地: ${selectedTunnel.localip}:${selectedTunnel.nport} | 链接: ${selectedTunnel.ip && selectedTunnel.dorp ? `${selectedTunnel.ip}:${selectedTunnel.dorp}` : "未知"}`
            : null,
          ...(!selectedTunnelId && tunnelLogCounts.size > 0
            ? Array.from(tunnelLogCounts.keys())
                .sort((a, b) => a - b)
                .map((id) => {
                  const tunnel = tunnels.find((t) => t.id === id);
                  if (!tunnel) return null;
                  const localAddr =
                    tunnel.localip && tunnel.nport
                      ? `${tunnel.localip}:${tunnel.nport}`
                      : "未知";
                  const remoteAddr =
                    tunnel.ip && tunnel.dorp
                      ? `${tunnel.ip}:${tunnel.dorp}`
                      : "未知";
                  return `  隧道${id}(${tunnel.name}): ${localAddr} → ${remoteAddr}`;
                })
                .filter((line): line is string => line !== null)
            : []),
          `日志: ${logsToSave.length} 条 | 时间: ${firstLogTime} ~ ${lastLogTime}`,
          "———FrpcLog———",
          "",
        ];

        // 过滤掉 null 值并连接
        const header = headerLines
          .filter((line): line is string => line !== null)
          .join("\n");

        const logContent = logsToSave
          .map(
            (log) =>
              `[${log.timestamp}] [隧道 ${log.tunnel_id}] ${log.message}`,
          )
          .join("\n");

        const fullContent = header + logContent;

        await writeTextFile(filePath, fullContent);
        toast.success("日志已保存");
      }
    } catch (error) {
      console.error("Failed to save logs:", error);
      toast.error(
        `保存日志失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  // 过滤日志
  const filteredLogs = selectedTunnelId
    ? logs.filter((log) => log.tunnel_id === selectedTunnelId)
    : logs;

  const tunnelOptions = [
    { value: 0, label: "所有隧道" },
    ...tunnels.map((t) => ({ value: t.id, label: t.name })),
  ];

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-medium text-foreground">日志</h1>

        <div className="flex items-center gap-2">
          <Select
            options={tunnelOptions}
            value={selectedTunnelId || 0}
            onChange={(value) =>
              setSelectedTunnelId(value === 0 ? null : Number(value))
            }
            placeholder="选择隧道"
            className="w-48"
          />

          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="w-4 h-4"
            />
            自动滚动
          </label>

          <button
            onClick={handleClearLogs}
            className="px-3 py-1.5 text-sm bg-card rounded-lg hover:bg-accent/50 transition-colors"
          >
            清空
          </button>

          <button
            onClick={handleSaveLogs}
            className="px-3 py-1.5 text-sm bg-foreground text-background rounded-lg hover:opacity-90 transition-opacity"
          >
            保存日志
          </button>
        </div>
      </div>

      <div className="flex-1 rounded-lg overflow-hidden bg-card">
        <ScrollArea className="h-full" ref={scrollRef}>
          <div
            className="p-4 font-mono text-[13px] space-y-1"
            data-allow-copy="true"
          >
            {filteredLogs.length === 0 ? (
              <div className="text-muted-foreground">
                {selectedTunnelId
                  ? "等待日志输出..."
                  : "请选择一个隧道或启动隧道以查看日志"}
              </div>
            ) : (
              filteredLogs.map((log, index) => (
                <div
                  key={index}
                  className="text-foreground/90 hover:bg-foreground/5 px-2 py-0.5 rounded"
                >
                  <span className="text-muted-foreground">
                    [{log.timestamp}]
                  </span>
                  {!selectedTunnelId && (
                    <span className="text-blue-500 ml-2">
                      [隧道 {log.tunnel_id}]
                    </span>
                  )}
                  <span className="ml-2">{log.message}</span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
