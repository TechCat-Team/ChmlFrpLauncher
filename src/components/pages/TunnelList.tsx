import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  fetchTunnels,
  type Tunnel,
  getStoredUser,
  offlineTunnel,
} from "@/services/api";
import { frpcManager, type LogMessage } from "@/services/frpcManager";
import { logStore } from "@/services/logStore";

// 模块级别的缓存，确保在组件卸载后数据仍然保留
const tunnelListCache = {
  tunnels: [] as Tunnel[],
};

interface TunnelProgress {
  progress: number; // 0-100
  isError: boolean; // 是否错误状态（红色）
  isSuccess: boolean; // 是否成功状态（绿色）
  startTime?: number; // 启动时间戳
}

const tunnelProgressCache = new Map<number, TunnelProgress>();

function restoreProgressFromLogs(logs: LogMessage[]): Map<number, TunnelProgress> {
  const progressMap = new Map<number, TunnelProgress>();
  const logsByTunnel = new Map<number, LogMessage[]>();
  for (const log of logs) {
    if (!logsByTunnel.has(log.tunnel_id)) {
      logsByTunnel.set(log.tunnel_id, []);
    }
    logsByTunnel.get(log.tunnel_id)!.push(log);
  }
  
  for (const [tunnelId, tunnelLogs] of logsByTunnel) {
    let progress = 0;
    let isError = false;
    let isSuccess = false;
    
    for (let i = tunnelLogs.length - 1; i >= 0; i--) {
      const message = tunnelLogs[i].message;
      
      if (message.includes("映射启动成功")) {
        progress = 100;
        isError = false;
        isSuccess = false;
        break;
      } else if (message.includes("已启动隧道")) {
        progress = 80;
      } else if (message.includes("成功登录至服务器")) {
        progress = 60;
      } else if (message.includes("已写入配置文件")) {
        progress = 40;
      } else if (message.includes("从ChmlFrp API获取配置文件")) {
        progress = 20;
      } else if (message.includes("frpc 进程已启动")) {
        progress = 10;
        break;
      }
    }
    
    if (progress > 0) {
      progressMap.set(tunnelId, { progress, isError, isSuccess });
      tunnelProgressCache.set(tunnelId, { progress, isError, isSuccess });
    }
  }
  
  return progressMap;
}

export function TunnelList() {
  const [tunnels, setTunnels] = useState<Tunnel[]>(() => {
    return tunnelListCache.tunnels;
  });
  const [loading, setLoading] = useState(() => {
    return tunnelListCache.tunnels.length === 0;
  });
  const [error, setError] = useState("");
  const [runningTunnels, setRunningTunnels] = useState<Set<number>>(new Set());
  const [togglingTunnels, setTogglingTunnels] = useState<Set<number>>(
    new Set(),
  );
  const [fixingTunnels, setFixingTunnels] = useState<Set<number>>(
    new Set(),
  );
  const [tunnelProgress, setTunnelProgress] = useState<
    Map<number, TunnelProgress>
  >(() => {
    const cached = new Map(tunnelProgressCache);
    const logs = logStore.getLogs();
    const restored = restoreProgressFromLogs(logs);
    for (const [tunnelId, progress] of restored) {
      cached.set(tunnelId, progress);
    }
    return cached;
  });
  const timeoutRefs = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const successTimeoutRefs = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const processedErrorsRef = useRef<Set<string>>(new Set());

  const loadTunnels = async () => {
    if (tunnelListCache.tunnels.length > 0) {
      setTunnels(tunnelListCache.tunnels);
      setLoading(false);

      const running = new Set<number>();
      for (const tunnel of tunnelListCache.tunnels) {
        const isRunning = await frpcManager.isTunnelRunning(tunnel.id);
        if (isRunning) {
          running.add(tunnel.id);
        }
      }
      setRunningTunnels(running);
    } else {
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
      if (
        message.includes("登录") ||
        message.includes("token") ||
        message.includes("令牌")
      ) {
        tunnelListCache.tunnels = [];
        setTunnels([]);
        setError(message);
      } else if (tunnelListCache.tunnels.length === 0) {
        setTunnels([]);
        setError(message);
      }
      console.error("获取隧道列表失败", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initializeProgress = async () => {
      await loadTunnels();
      logStore.startListening();
      
      const logs = logStore.getLogs();
      if (logs.length > 0) {
        const restored = restoreProgressFromLogs(logs);
        if (restored.size > 0) {
          const runningTunnels = await frpcManager.getRunningTunnels();
          const runningSet = new Set(runningTunnels);
          
          setTunnelProgress((prev) => {
            const merged = new Map(prev);
            for (const [tunnelId, progress] of restored) {
              if (!runningSet.has(tunnelId)) {
                merged.set(tunnelId, { progress: 0, isError: false, isSuccess: false });
                tunnelProgressCache.set(tunnelId, { progress: 0, isError: false, isSuccess: false });
              } else {
                merged.set(tunnelId, { ...progress, isSuccess: false });
                tunnelProgressCache.set(tunnelId, { ...progress, isSuccess: false });
              }
            }
            return merged;
          });
        }
      }
    };
    
    initializeProgress();
  }, []);

  const handleDuplicateTunnelError = useCallback(
    async (tunnelId: number, tunnelName: string) => {
      const user = getStoredUser();
      if (!user?.usertoken) {
        toast.error("未找到用户令牌，请重新登录");
        return;
      }

      if (fixingTunnels.has(tunnelId)) {
        return;
      }

      setFixingTunnels((prev) => new Set(prev).add(tunnelId));

      toast.info("隧道重复启动导致隧道启动失败，自动修复中....", {
        duration: 10000,
      });

      let cleanedTunnelName = tunnelName?.trim() || "";
      cleanedTunnelName = cleanedTunnelName.replace(/^\*\*\*TOKEN\*\*\*\./, "");
      
      if (!cleanedTunnelName || cleanedTunnelName === "") {
        console.error("隧道名称为空，无法修复", { tunnelId, tunnelName, cleanedTunnelName });
        toast.error("无法获取隧道名称，请手动处理");
        setFixingTunnels((prev) => {
          const next = new Set(prev);
          next.delete(tunnelId);
          return next;
        });
        return;
      }

      try {
        console.log("调用下线隧道API", { tunnelId, tunnelName: cleanedTunnelName });
        
        await offlineTunnel(cleanedTunnelName, user.usertoken);
        
        await new Promise((resolve) => setTimeout(resolve, 8000));

          const tunnel = tunnels.find((t) => t.id === tunnelId);
          if (tunnel) {
            setTunnelProgress((prev) => {
              const next = new Map(prev);
              const resetProgress = { progress: 0, isError: false, isSuccess: false };
              next.set(tunnelId, resetProgress);
              tunnelProgressCache.set(tunnelId, resetProgress);
              return next;
            });

            try {
              await frpcManager.stopTunnel(tunnelId);
              await new Promise((resolve) => setTimeout(resolve, 500));
            } catch {
              // 忽略停止错误
            }

            await frpcManager.startTunnel(tunnelId, user.usertoken);
            setRunningTunnels((prev) => new Set(prev).add(tunnelId));

            let hasChecked = false;
            let hasSuccess = false;
            const errorCheckInterval = setInterval(() => {
              if (hasChecked) {
                clearInterval(errorCheckInterval);
                return;
              }

              const logs = logStore.getLogs();
              const successLogs = logs.filter(
                (log) =>
                  log.tunnel_id === tunnelId &&
                  log.message.includes("映射启动成功"),
              );

              if (successLogs.length > 0) {
                hasSuccess = true;
                hasChecked = true;
                clearInterval(errorCheckInterval);
                toast.success("隧道自动修复成功，已重新启动", {
                  duration: 5000,
                });
                return;
              }

              const recentErrorLogs = logs.filter(
                (log) =>
                  log.tunnel_id === tunnelId &&
                  log.message.includes("启动失败") &&
                  log.message.includes("already exists"),
              );

              if (recentErrorLogs.length > 0 && !hasSuccess) {
                hasChecked = true;
                clearInterval(errorCheckInterval);
                toast.error(
                  "因为隧道重复启动导致映射启动失败。系统自动修复失败，请更换外网端口或节点",
                  { duration: 8000 },
                );
                setTunnelProgress((prev) => {
                  const current = prev.get(tunnelId);
                  if (current) {
                    const errorProgress = {
                      ...current,
                      progress: 100,
                      isError: true,
                      isSuccess: false,
                    };
                    tunnelProgressCache.set(tunnelId, errorProgress);
                    return new Map(prev).set(tunnelId, errorProgress);
                  }
                  return prev;
                });
              }
            }, 2000);

            setTimeout(() => {
              if (!hasChecked) {
                hasChecked = true;
                clearInterval(errorCheckInterval);
              }
            }, 20000);
          }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "自动修复失败";
        toast.error(message, { duration: 5000 });
        setTunnelProgress((prev) => {
          const current = prev.get(tunnelId);
          if (current) {
            const errorProgress = {
              ...current,
              progress: 100,
              isError: true,
            };
            tunnelProgressCache.set(tunnelId, errorProgress);
            return new Map(prev).set(tunnelId, errorProgress);
          }
          return prev;
        });
      } finally {
        setFixingTunnels((prev) => {
          const next = new Set(prev);
          next.delete(tunnelId);
          return next;
        });
      }
    },
    [tunnels, fixingTunnels],
  );

  useEffect(() => {
    const unsubscribe = logStore.subscribe((logs: LogMessage[]) => {
      if (logs.length === 0) return;

      const latestLog = logs[logs.length - 1];
      const tunnelId = latestLog.tunnel_id;
      const message = latestLog.message;

      setTunnelProgress((prev) => {
        const current = prev.get(tunnelId);
        if (!current && !message.includes("frpc 进程已启动")) {
          return prev;
        }

        const newProgress = current || { progress: 0, isError: false, isSuccess: false };

        if (message.includes("frpc 进程已启动")) {
          newProgress.startTime = Date.now();
          newProgress.progress = 10;
          if (timeoutRefs.current.has(tunnelId)) {
            clearTimeout(timeoutRefs.current.get(tunnelId)!);
          }
          const timeout = setTimeout(() => {
            setTunnelProgress((prev) => {
              const current = prev.get(tunnelId);
              if (current && current.progress < 100 && !current.isError) {
                const errorProgress = {
                  ...current,
                  progress: 100,
                  isError: true,
                };
                tunnelProgressCache.set(tunnelId, errorProgress);
                return new Map(prev).set(tunnelId, errorProgress);
              }
              return prev;
            });
          }, 10000);
          timeoutRefs.current.set(tunnelId, timeout);
        }
        else if (message.includes("从ChmlFrp API获取配置文件")) {
          newProgress.progress = 20;
        }
        else if (message.includes("已写入配置文件")) {
          newProgress.progress = 40;
        }
        else if (message.includes("成功登录至服务器")) {
          newProgress.progress = 60;
        }
        else if (message.includes("已启动隧道")) {
          newProgress.progress = 80;
        }
        else if (message.includes("映射启动成功")) {
          newProgress.progress = 100;
          newProgress.isError = false;
          newProgress.isSuccess = true;
          if (timeoutRefs.current.has(tunnelId)) {
            clearTimeout(timeoutRefs.current.get(tunnelId)!);
            timeoutRefs.current.delete(tunnelId);
          }
          if (successTimeoutRefs.current.has(tunnelId)) {
            clearTimeout(successTimeoutRefs.current.get(tunnelId)!);
          }
          const successTimeout = setTimeout(() => {
            setTunnelProgress((prev) => {
              const current = prev.get(tunnelId);
              if (current) {
                const updated = {
                  ...current,
                  isSuccess: false,
                };
                tunnelProgressCache.set(tunnelId, updated);
                return new Map(prev).set(tunnelId, updated);
              }
              return prev;
            });
            successTimeoutRefs.current.delete(tunnelId);
          }, 2000);
          successTimeoutRefs.current.set(tunnelId, successTimeout);
        }
        else if (
          message.includes("启动失败") &&
          message.includes("already exists")
        ) {
          const errorKey = `${tunnelId}-${message}`;
          
          if (processedErrorsRef.current.has(errorKey)) {
            return prev;
          }
          
          if (!fixingTunnels.has(tunnelId)) {
            const match = message.match(/\[([^\]]+)\]/g);
            let tunnelName = "";
            
            if (match && match.length > 0) {
              tunnelName = match[match.length - 1].slice(1, -1);
              tunnelName = tunnelName.replace(/^\*\*\*TOKEN\*\*\*\./, "");
            }
            
            if (!tunnelName || tunnelName.trim() === "") {
              const tunnel = tunnels.find((t) => t.id === tunnelId);
              if (tunnel) {
                tunnelName = tunnel.name;
                tunnelName = tunnelName.replace(/^\*\*\*TOKEN\*\*\*\./, "");
              }
            }
            
            if (tunnelName && tunnelName.trim() !== "") {
              processedErrorsRef.current.add(errorKey);
              setTimeout(() => {
                processedErrorsRef.current.delete(errorKey);
              }, 5 * 60 * 1000);
              
              handleDuplicateTunnelError(tunnelId, tunnelName.trim());
            } else {
              console.error("无法提取隧道名称", { tunnelId, message, matches: match });
              processedErrorsRef.current.add(errorKey);
            }
          }
        }

        const updated = new Map(prev).set(tunnelId, { ...newProgress });
        tunnelProgressCache.set(tunnelId, { ...newProgress });
        return updated;
      });
    });

    return () => {
      unsubscribe();
    };
  }, [fixingTunnels, handleDuplicateTunnelError, tunnels]);

  useEffect(() => {
    const timeouts = timeoutRefs.current;
    const successTimeouts = successTimeoutRefs.current;
    return () => {
      timeouts.forEach((timeout) => clearTimeout(timeout));
      timeouts.clear();
      successTimeouts.forEach((timeout) => clearTimeout(timeout));
      successTimeouts.clear();
    };
  }, []);

  useEffect(() => {
    if (tunnels.length === 0) return;

    const checkRunningStatus = async () => {
      const running = new Set<number>();
      for (const tunnel of tunnels) {
        const isRunning = await frpcManager.isTunnelRunning(tunnel.id);
        if (isRunning) {
          running.add(tunnel.id);
        } else {
          if (runningTunnels.has(tunnel.id)) {
            setTunnelProgress((prev) => {
              const current = prev.get(tunnel.id);
              if (current && current.progress < 100) {
                const errorProgress = {
                  ...current,
                  progress: 100,
                  isError: true,
                  isSuccess: false,
                };
                tunnelProgressCache.set(tunnel.id, errorProgress);
                return new Map(prev).set(tunnel.id, errorProgress);
              }
              return prev;
            });
          } else {
            setTunnelProgress((prev) => {
              const current = prev.get(tunnel.id);
              if (current && current.progress > 0) {
                const cleared = { progress: 0, isError: false, isSuccess: false };
                tunnelProgressCache.set(tunnel.id, cleared);
                return new Map(prev).set(tunnel.id, cleared);
              }
              return prev;
            });
            if (successTimeoutRefs.current.has(tunnel.id)) {
              clearTimeout(successTimeoutRefs.current.get(tunnel.id)!);
              successTimeoutRefs.current.delete(tunnel.id);
            }
          }
        }
      }
      setRunningTunnels(running);
    };

    const interval = setInterval(checkRunningStatus, 5000);

    return () => clearInterval(interval);
  }, [tunnels, runningTunnels]);

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
        setTunnelProgress((prev) => {
          const next = new Map(prev);
          const resetProgress = { progress: 0, isError: false, isSuccess: false };
          next.set(tunnel.id, resetProgress);
          tunnelProgressCache.set(tunnel.id, resetProgress);
          return next;
        });
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
        setTunnelProgress((prev) => {
          const next = new Map(prev);
          next.set(tunnel.id, { progress: 0, isError: false, isSuccess: false });
          tunnelProgressCache.set(tunnel.id, { progress: 0, isError: false, isSuccess: false });
          return next;
        });
        if (timeoutRefs.current.has(tunnel.id)) {
          clearTimeout(timeoutRefs.current.get(tunnel.id)!);
          timeoutRefs.current.delete(tunnel.id);
        }
        if (successTimeoutRefs.current.has(tunnel.id)) {
          clearTimeout(successTimeoutRefs.current.get(tunnel.id)!);
          successTimeoutRefs.current.delete(tunnel.id);
        }
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : `${enabled ? "启动" : "停止"}失败`;
      toast.error(message);
      if (enabled) {
        const errorProgress = { progress: 100, isError: true, isSuccess: false };
        setTunnelProgress((prev) => {
          const next = new Map(prev);
          next.set(tunnel.id, errorProgress);
          return next;
        });
        tunnelProgressCache.set(tunnel.id, errorProgress);
      }
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
              const progress = tunnelProgress.get(tunnel.id);
              const progressValue = progress?.progress ?? 0;
              const isError = progress?.isError ?? false;
              const isSuccess = progress?.isSuccess ?? false;
              return (
                <div
                  key={tunnel.id}
                  className="border border-border/60 rounded-lg overflow-hidden hover:border-foreground/20 transition-colors bg-card"
                >
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
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
