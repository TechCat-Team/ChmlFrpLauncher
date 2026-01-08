import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { ScrollArea } from "../ui/scroll-area";
import { Select } from "../ui/select";
import { fetchTunnels, type Tunnel } from "../../services/api";
import { frpcManager, type LogMessage } from "../../services/frpcManager";
import { logStore } from "../../services/logStore";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

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
    if (logs.length === 0) {
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
        const logContent = filteredLogs
          .map(
            (log) =>
              `[${log.timestamp}] [隧道 ${log.tunnel_id}] ${log.message}`,
          )
          .join("\n");

        await writeTextFile(filePath, logContent);
        toast.success("日志已保存");
      }
    } catch (error) {
      console.error("Failed to save logs:", error);
      toast.error("保存日志失败");
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
            className="px-3 py-1.5 text-sm bg-card border border-border/60 rounded-lg hover:border-foreground/20 transition-colors"
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

      <div className="flex-1 border border-border/60 rounded-lg overflow-hidden bg-card">
        <ScrollArea className="h-full" ref={scrollRef}>
          <div className="p-4 font-mono text-[13px] space-y-1">
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
