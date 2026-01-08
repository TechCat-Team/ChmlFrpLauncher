import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ScrollArea } from "../ui/scroll-area";
import { fetchTunnels, type Tunnel, getStoredUser } from "../../services/api";
import { frpcManager } from "../../services/frpcManager";

// 模块级别的缓存，确保在组件卸载后数据仍然保留
const tunnelListCache = {
  tunnels: [] as Tunnel[],
};

export function TunnelList() {
  const [tunnels, setTunnels] = useState<Tunnel[]>(() => {
    // 初始化时如果有缓存数据，先显示缓存数据
    return tunnelListCache.tunnels;
  });
  const [loading, setLoading] = useState(() => {
    // 如果有缓存数据，不显示加载状态
    return tunnelListCache.tunnels.length === 0;
  });
  const [error, setError] = useState("");
  const [runningTunnels, setRunningTunnels] = useState<Set<number>>(new Set());
  const [togglingTunnels, setTogglingTunnels] = useState<Set<number>>(
    new Set(),
  );

  const loadTunnels = async () => {
    // 如果有缓存数据，先显示缓存数据
    if (tunnelListCache.tunnels.length > 0) {
      setTunnels(tunnelListCache.tunnels);
      setLoading(false);

      // 检查缓存数据的运行状态
      const running = new Set<number>();
      for (const tunnel of tunnelListCache.tunnels) {
        const isRunning = await frpcManager.isTunnelRunning(tunnel.id);
        if (isRunning) {
          running.add(tunnel.id);
        }
      }
      setRunningTunnels(running);
    } else {
      // 第一次加载，显示加载状态
      setLoading(true);
    }

    setError("");
    try {
      const data = await fetchTunnels();
      setTunnels(data);
      tunnelListCache.tunnels = data;

      const running = new Set<number>();
      for (const tunnel of data) {
        const isRunning = await frpcManager.isTunnelRunning(tunnel.id);
        if (isRunning) {
          running.add(tunnel.id);
        }
      }
      setRunningTunnels(running);
    } catch (err) {
      const message = err instanceof Error ? err.message : "获取隧道列表失败";
      // 如果是登录相关的错误，清除缓存
      if (
        message.includes("登录") ||
        message.includes("token") ||
        message.includes("令牌")
      ) {
        tunnelListCache.tunnels = [];
        setTunnels([]);
        setError(message);
      } else if (tunnelListCache.tunnels.length === 0) {
        // 如果加载失败且没有缓存数据，才显示错误
        setTunnels([]);
        setError(message);
      }
      console.error("获取隧道列表失败", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTunnels();
  }, []);

  // 定期检查运行状态
  useEffect(() => {
    if (tunnels.length === 0) return;

    const checkRunningStatus = async () => {
      const running = new Set<number>();
      for (const tunnel of tunnels) {
        const isRunning = await frpcManager.isTunnelRunning(tunnel.id);
        if (isRunning) {
          running.add(tunnel.id);
        }
      }
      setRunningTunnels(running);
    };

    // 每5秒检查一次
    const interval = setInterval(checkRunningStatus, 5000);

    return () => clearInterval(interval);
  }, [tunnels]);

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
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : `${enabled ? "启动" : "停止"}失败`;
      toast.error(message);
    } finally {
      setTogglingTunnels((prev) => {
        const next = new Set(prev);
        next.delete(tunnel.id);
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium text-foreground">隧道</h1>
        {!loading && !error && (
          <span className="text-xs text-muted-foreground">
            {tunnels.length} 个
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          加载中...
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          {error}
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0 pr-1">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {tunnels.map((tunnel) => {
              const isRunning = runningTunnels.has(tunnel.id);
              const isToggling = togglingTunnels.has(tunnel.id);
              return (
                <div
                  key={tunnel.id}
                  className="border border-border/60 rounded-lg p-4 hover:border-foreground/20 transition-colors bg-card"
                >
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
                        onChange={(e) => handleToggle(tunnel, e.target.checked)}
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
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
