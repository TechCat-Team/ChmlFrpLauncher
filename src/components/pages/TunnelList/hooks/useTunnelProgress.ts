import { useState, useEffect, useRef, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import type { Tunnel } from "@/services/api";
import { getStoredUser, offlineTunnel } from "@/services/api";
import { frpcManager, type LogMessage } from "@/services/frpcManager";
import { logStore } from "@/services/logStore";
import type { TunnelProgress } from "../types";
import { tunnelProgressCache } from "../cache";
import { restoreProgressFromLogs } from "../utils";

export function useTunnelProgress(
  tunnels: Tunnel[],
  runningTunnels: Set<number>,
  setRunningTunnels: Dispatch<SetStateAction<Set<number>>>,
) {
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
  const [fixingTunnels, setFixingTunnels] = useState<Set<number>>(new Set());
  const timeoutRefs = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const successTimeoutRefs = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const processedErrorsRef = useRef<Set<string>>(new Set());

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
        console.error("隧道名称为空，无法修复", {
          tunnelId,
          tunnelName,
          cleanedTunnelName,
        });
        toast.error("无法获取隧道名称，请手动处理");
        setFixingTunnels((prev) => {
          const next = new Set(prev);
          next.delete(tunnelId);
          return next;
        });
        return;
      }

      try {
        console.log("调用下线隧道API", {
          tunnelId,
          tunnelName: cleanedTunnelName,
        });

        await offlineTunnel(cleanedTunnelName, user.usertoken);

        await new Promise((resolve) => setTimeout(resolve, 8000));

        const tunnel = tunnels.find((t) => t.id === tunnelId);
        if (tunnel) {
          setTunnelProgress((prev) => {
            const next = new Map(prev);
            const resetProgress = {
              progress: 0,
              isError: false,
              isSuccess: false,
            };
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
    [tunnels, fixingTunnels, setRunningTunnels],
  );

  // 初始化进度
  useEffect(() => {
    const initializeProgress = async () => {
      logStore.startListening();

      const logs = logStore.getLogs();
      if (logs.length > 0) {
        const restored = restoreProgressFromLogs(logs);
        if (restored.size > 0) {
          const runningTunnelsList = await frpcManager.getRunningTunnels();
          const runningSet = new Set(runningTunnelsList);

          setTunnelProgress((prev) => {
            const merged = new Map(prev);
            for (const [tunnelId, progress] of restored) {
              if (!runningSet.has(tunnelId)) {
                merged.set(tunnelId, {
                  progress: 0,
                  isError: false,
                  isSuccess: false,
                });
                tunnelProgressCache.set(tunnelId, {
                  progress: 0,
                  isError: false,
                  isSuccess: false,
                });
              } else {
                merged.set(tunnelId, { ...progress, isSuccess: false });
                tunnelProgressCache.set(tunnelId, {
                  ...progress,
                  isSuccess: false,
                });
              }
            }
            return merged;
          });
        }
      }
    };

    initializeProgress();
  }, []);

  // 监听日志更新
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

        const newProgress =
          current || { progress: 0, isError: false, isSuccess: false };

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
        } else if (message.includes("从ChmlFrp API获取配置文件")) {
          newProgress.progress = 20;
        } else if (message.includes("已写入配置文件")) {
          newProgress.progress = 40;
        } else if (message.includes("成功登录至服务器")) {
          newProgress.progress = 60;
        } else if (message.includes("已启动隧道")) {
          newProgress.progress = 80;
        } else if (message.includes("映射启动成功")) {
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
        } else if (
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
              console.error("无法提取隧道名称", {
                tunnelId,
                message,
                matches: match,
              });
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

  // 清理定时器
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

  // 监听运行状态变化，更新进度
  useEffect(() => {
    if (tunnels.length === 0) return;

    const checkRunningStatus = async () => {
      for (const tunnel of tunnels) {
        const isRunning = await frpcManager.isTunnelRunning(tunnel.id);
        if (!isRunning) {
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
                const cleared = {
                  progress: 0,
                  isError: false,
                  isSuccess: false,
                };
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
    };

    const interval = setInterval(checkRunningStatus, 5000);

    return () => clearInterval(interval);
  }, [tunnels, runningTunnels]);

  return {
    tunnelProgress,
    setTunnelProgress,
    timeoutRefs,
    successTimeoutRefs,
  };
}

