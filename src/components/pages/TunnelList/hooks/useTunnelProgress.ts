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
import { playTunnelSound } from "@/lib/sound";

export function useTunnelProgress(
  tunnels: Tunnel[],
  runningTunnels: Set<string>,
  setRunningTunnels: Dispatch<SetStateAction<Set<string>>>,
) {
  const [tunnelProgress, setTunnelProgress] = useState<
    Map<string, TunnelProgress>
  >(() => {
    const cached = new Map<string, TunnelProgress>();
    const logs = logStore.getLogs();
    const restored = restoreProgressFromLogs(logs);
    for (const [tunnelId, progress] of restored) {
      cached.set(`api_${tunnelId}`, progress);
    }
    return cached;
  });
  const [fixingTunnels, setFixingTunnels] = useState<Set<number>>(new Set());
  const [fixingTlsTunnels, setFixingTlsTunnels] = useState<Set<number>>(
    new Set(),
  );
  const timeoutRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const successTimeoutRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const processedErrorsRef = useRef<Set<string>>(new Set());
  const playedSoundRef = useRef<Set<string>>(new Set());
  const processedLogsCountRef = useRef<number>(0);
  const loggedSuccessRef = useRef<Set<number>>(new Set());
  const duplicateFixAttemptsRef = useRef<Map<number, number>>(new Map());

  const handleDuplicateTunnelError = useCallback(
    async (tunnelId: number, tunnelName: string) => {
      const user = getStoredUser();
      if (!user?.usertoken) {
        toast.error("未找到用户令牌，请重新登录");
        return;
      }

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

      if (fixingTunnels.has(tunnelId)) {
        return;
      }

      const attempts = duplicateFixAttemptsRef.current.get(tunnelId) || 0;
      if (attempts >= 1) {
        return;
      }

      duplicateFixAttemptsRef.current.set(tunnelId, attempts + 1);
      setFixingTunnels((prev) => new Set(prev).add(tunnelId));

      const timestamp = new Date()
        .toLocaleString("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
        .replace(/\//g, "/");

      logStore.addLog({
        tunnel_id: tunnelId,
        message:
          "[I] [ChmlFrpLauncher] 隧道重复启动导致隧道启动失败，自动修复中....",
        timestamp,
      });

      toast.info("隧道重复启动导致隧道启动失败，自动修复中....", {
        duration: 10000,
      });

      try {
        await offlineTunnel(cleanedTunnelName, user.usertoken);

        await new Promise((resolve) => setTimeout(resolve, 8000));

        const tunnel = tunnels.find((t) => t.id === tunnelId);
        if (tunnel) {
          const tunnelKey = `api_${tunnelId}`;
          setTunnelProgress((prev) => {
            const next = new Map(prev);
            const resetProgress = {
              progress: 0,
              isError: false,
              isSuccess: false,
            };
            next.set(tunnelKey, resetProgress);
            tunnelProgressCache.set(tunnelId, resetProgress);
            return next;
          });

          try {
            await frpcManager.stopTunnel(tunnelId);
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch {
            // 忽略错误
          }

          await frpcManager.startTunnel(tunnel, user.usertoken);
          setRunningTunnels((prev) => new Set(prev).add(tunnelKey));

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
              const tunnelKey = `api_${tunnelId}`;
              setTunnelProgress((prev) => {
                const current = prev.get(tunnelKey);
                if (current) {
                  const errorProgress = {
                    ...current,
                    progress: 100,
                    isError: true,
                    isSuccess: false,
                  };
                  tunnelProgressCache.set(tunnelId, errorProgress);

                  if (!playedSoundRef.current.has(tunnelKey)) {
                    playedSoundRef.current.add(tunnelKey);
                    const soundEnabled =
                      localStorage.getItem("tunnelSoundEnabled") !== "false";
                    playTunnelSound("error", soundEnabled);
                  }

                  return new Map(prev).set(tunnelKey, errorProgress);
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
        const message = err instanceof Error ? err.message : "自动修复失败";
        toast.error(message, { duration: 5000 });
        const tunnelKey = `api_${tunnelId}`;
        setTunnelProgress((prev) => {
          const current = prev.get(tunnelKey);
          if (current) {
            const errorProgress = {
              ...current,
              progress: 100,
              isError: true,
            };
            tunnelProgressCache.set(tunnelId, errorProgress);

            if (!playedSoundRef.current.has(tunnelKey)) {
              playedSoundRef.current.add(tunnelKey);
              const soundEnabled =
                localStorage.getItem("tunnelSoundEnabled") !== "false";
              playTunnelSound("error", soundEnabled);
            }

            return new Map(prev).set(tunnelKey, errorProgress);
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

  const handleTlsError = useCallback(
    async (tunnelId: number) => {
      const user = getStoredUser();
      if (!user?.usertoken) {
        toast.error("未找到用户令牌，请重新登录");
        return;
      }

      if (fixingTlsTunnels.has(tunnelId)) {
        return;
      }

      setFixingTlsTunnels((prev) => new Set(prev).add(tunnelId));

      toast.info("检测到 TLS 问题，自动修复中....", {
        duration: 10000,
      });

      try {
        try {
          await frpcManager.stopTunnel(tunnelId);
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch {
          // 忽略错误
        }

        const tunnel = tunnels.find((t) => t.id === tunnelId);
        if (!tunnel) {
          toast.error("未找到隧道信息", { duration: 5000 });
          return;
        }

        const tunnelKey = `api_${tunnelId}`;
        setTunnelProgress((prev) => {
          const next = new Map(prev);
          const resetProgress = {
            progress: 0,
            isError: false,
            isSuccess: false,
          };
          next.set(tunnelKey, resetProgress);
          tunnelProgressCache.set(tunnelId, resetProgress);
          return next;
        });

        await frpcManager.startTunnel(tunnel, user.usertoken);
        setRunningTunnels((prev) => new Set(prev).add(tunnelKey));

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
            toast.success("TLS 配置已自动修复，隧道已重新启动", {
              duration: 5000,
            });
            return;
          }

          const recentErrorLogs = logs.filter(
            (log) =>
              log.tunnel_id === tunnelId &&
              (log.message.includes("启动失败") ||
                log.message.includes("请尝试将配置文件中tls_enable")),
          );

          if (recentErrorLogs.length > 0 && !hasSuccess) {
            hasChecked = true;
            clearInterval(errorCheckInterval);
            toast.error("自动修复失败，请尝试更换节点", { duration: 8000 });
            setTunnelProgress((prev) => {
              const current = prev.get(tunnelKey);
              if (current) {
                const errorProgress = {
                  ...current,
                  progress: 100,
                  isError: true,
                  isSuccess: false,
                };
                tunnelProgressCache.set(tunnelId, errorProgress);

                if (!playedSoundRef.current.has(tunnelKey)) {
                  playedSoundRef.current.add(tunnelKey);
                  const soundEnabled =
                    localStorage.getItem("tunnelSoundEnabled") !== "false";
                  playTunnelSound("error", soundEnabled);
                }

                return new Map(prev).set(tunnelKey, errorProgress);
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
      } catch {
        toast.error(`自动修复失败，请尝试更换节点`, {
          duration: 5000,
        });
        const tunnelKey = `api_${tunnelId}`;
        setTunnelProgress((prev) => {
          const current = prev.get(tunnelKey);
          if (current) {
            const errorProgress = {
              ...current,
              progress: 100,
              isError: true,
            };
            tunnelProgressCache.set(tunnelId, errorProgress);

            if (!playedSoundRef.current.has(tunnelKey)) {
              playedSoundRef.current.add(tunnelKey);
              const soundEnabled =
                localStorage.getItem("tunnelSoundEnabled") !== "false";
              playTunnelSound("error", soundEnabled);
            }

            return new Map(prev).set(tunnelKey, errorProgress);
          }
          return prev;
        });
      } finally {
        setFixingTlsTunnels((prev) => {
          const next = new Set(prev);
          next.delete(tunnelId);
          return next;
        });
      }
    },
    [fixingTlsTunnels, setRunningTunnels, tunnels],
  );

  useEffect(() => {
    const initializeProgress = async () => {
      logStore.startListening();

      const logs = logStore.getLogs();
      if (logs.length > 0) {
        processedLogsCountRef.current = logs.length;

        const restored = restoreProgressFromLogs(logs);
        if (restored.size > 0) {
          const runningTunnelsList = await frpcManager.getRunningTunnels();
          const runningSet = new Set(runningTunnelsList);

          setTunnelProgress((prev) => {
            const merged = new Map(prev);
            for (const [tunnelId, progress] of restored) {
              const tunnelKey = `api_${tunnelId}`;
              if (!runningSet.has(tunnelId)) {
                merged.set(tunnelKey, {
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
                merged.set(tunnelKey, { ...progress, isSuccess: false });
                tunnelProgressCache.set(tunnelId, {
                  ...progress,
                  isSuccess: false,
                });

                if (progress.progress === 100) {
                  playedSoundRef.current.add(tunnelKey);
                }
              }
            }
            return merged;
          });
        }
      }
    };

    initializeProgress();
  }, []);

  useEffect(() => {
    const unsubscribe = logStore.subscribe((logs: LogMessage[]) => {
      if (logs.length === 0) return;

      if (processedLogsCountRef.current > logs.length) {
        processedLogsCountRef.current = logs.length;
      }

      const startIndex = processedLogsCountRef.current;
      if (startIndex >= logs.length) return;

      const newLogs = logs.slice(startIndex);
      processedLogsCountRef.current = logs.length;

      for (const log of newLogs) {
        const tunnelId = log.tunnel_id;
        const tunnelKey = `api_${tunnelId}`;
        const message = log.message;

        setTunnelProgress((prev) => {
          const current = prev.get(tunnelKey);
          if (!current && !message.includes("frpc 进程已启动")) {
            return prev;
          }

          const newProgress = current || {
            progress: 0,
            isError: false,
            isSuccess: false,
          };

          if (message.includes("frpc 进程已启动")) {
            newProgress.startTime = Date.now();
            newProgress.progress = 10;
            playedSoundRef.current.delete(tunnelKey);
            loggedSuccessRef.current.delete(tunnelId);
            if (timeoutRefs.current.has(tunnelKey)) {
              clearTimeout(timeoutRefs.current.get(tunnelKey)!);
            }
            const timeout = setTimeout(() => {
              setTunnelProgress((prev) => {
                const current = prev.get(tunnelKey);
                if (current && current.progress < 100 && !current.isError) {
                  const errorProgress = {
                    ...current,
                    progress: 100,
                    isError: true,
                  };
                  tunnelProgressCache.set(tunnelId, errorProgress);

                  if (!playedSoundRef.current.has(tunnelKey)) {
                    playedSoundRef.current.add(tunnelKey);
                    const soundEnabled =
                      localStorage.getItem("tunnelSoundEnabled") !== "false";
                    playTunnelSound("error", soundEnabled);
                  }

                  return new Map(prev).set(tunnelKey, errorProgress);
                }
                return prev;
              });
            }, 10000);
            timeoutRefs.current.set(tunnelKey, timeout);
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
            if (timeoutRefs.current.has(tunnelKey)) {
              clearTimeout(timeoutRefs.current.get(tunnelKey)!);
              timeoutRefs.current.delete(tunnelKey);
            }
            if (successTimeoutRefs.current.has(tunnelKey)) {
              clearTimeout(successTimeoutRefs.current.get(tunnelKey)!);
            }

            if (!playedSoundRef.current.has(tunnelKey)) {
              playedSoundRef.current.add(tunnelKey);
              const soundEnabled =
                localStorage.getItem("tunnelSoundEnabled") !== "false";
              playTunnelSound("success", soundEnabled);
            }

            const tunnel = tunnels.find((t) => t.id === tunnelId);
            if (tunnel && !loggedSuccessRef.current.has(tunnelId)) {
              loggedSuccessRef.current.add(tunnelId);

              const timestamp = new Date()
                .toLocaleString("zh-CN", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                })
                .replace(/\//g, "/");

              const tunnelName = tunnel.name || `隧道${tunnelId}`;
              const isHttpTunnel =
                tunnel.type?.toLowerCase() === "http" ||
                tunnel.type?.toLowerCase() === "https";

              if (isHttpTunnel) {
                const link = tunnel.dorp || "";
                if (link) {
                  logStore.addLog({
                    tunnel_id: tunnelId,
                    message: `[I] [ChmlFrpLauncher] 隧道"${tunnelName}"启动成功，您可以通过"${link}"访问。`,
                    timestamp,
                  });
                } else {
                  logStore.addLog({
                    tunnel_id: tunnelId,
                    message: `[I] [ChmlFrpLauncher] 隧道"${tunnelName}"启动成功。`,
                    timestamp,
                  });
                }
              } else {
                const remotePort = tunnel.dorp || "";
                const primaryLink =
                  tunnel.ip && remotePort ? `${tunnel.ip}:${remotePort}` : "";
                const fallbackLink =
                  tunnel.node_ip && remotePort
                    ? `${tunnel.node_ip}:${remotePort}`
                    : "";
                const normalizedIpv6 =
                  typeof tunnel.node_ipv6 === "string"
                    ? tunnel.node_ipv6.trim()
                    : "";
                const ipv6Link =
                  normalizedIpv6 &&
                  normalizedIpv6 !== "null" &&
                  normalizedIpv6 !== "undefined" &&
                  remotePort
                    ? `[${normalizedIpv6}]:${remotePort}`
                    : "";

                let messageText = `[I] [ChmlFrpLauncher] 隧道"${tunnelName}"启动成功`;

                if (primaryLink) {
                  messageText += `，您可以通过"${primaryLink}"访问（推荐）`;
                } else if (fallbackLink) {
                  messageText += `，您可以通过"${fallbackLink}"访问`;
                }

                if (
                  fallbackLink &&
                  primaryLink &&
                  fallbackLink !== primaryLink
                ) {
                  messageText += `。如果无法访问，可以尝试使用"${fallbackLink}"连接`;
                }

                if (
                  ipv6Link &&
                  ipv6Link !== primaryLink &&
                  ipv6Link !== fallbackLink
                ) {
                  messageText += `。若支持IPV6，也可使用"${ipv6Link}"连接`;
                }

                messageText += "。";

                logStore.addLog({
                  tunnel_id: tunnelId,
                  message: messageText,
                  timestamp,
                });
              }
            }

            const successTimeout = setTimeout(() => {
              setTunnelProgress((prev) => {
                const current = prev.get(tunnelKey);
                if (current) {
                  const updated = {
                    ...current,
                    isSuccess: false,
                  };
                  tunnelProgressCache.set(tunnelId, updated);
                  playedSoundRef.current.delete(tunnelKey);
                  return new Map(prev).set(tunnelKey, updated);
                }
                return prev;
              });
              successTimeoutRefs.current.delete(tunnelKey);
            }, 2000);
            successTimeoutRefs.current.set(tunnelKey, successTimeout);
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
                setTimeout(
                  () => {
                    processedErrorsRef.current.delete(errorKey);
                  },
                  5 * 60 * 1000,
                );

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
          } else if (message.includes("429 Unknown Status")) {
            const errorKey = `${tunnelId}-429-Unknown-Status`;

            if (processedErrorsRef.current.has(errorKey)) {
              return prev;
            }

            processedErrorsRef.current.add(errorKey);
            setTimeout(
              () => {
                processedErrorsRef.current.delete(errorKey);
              },
              5 * 60 * 1000,
            );

            toast.error(
              "您的账户已被限制，暂时无法启动隧道，详情请前往日志查看",
              {
                duration: 8000,
              },
            );

            const errorMessage =
              "您的账户由于多次无效的启动隧道，账户被系统暂时限制启动隧道，限制一般会在24小时内自动解除，同时请您检查其他地方有没有挂守护进程这类程序导致映射一直重复启动。如果您有其他问题，请前往任意交流群询问，交流群链接在软件首页底部";
            const now = new Date();
            const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
            logStore.addLog({
              tunnel_id: tunnelId,
              message: errorMessage,
              timestamp,
            });

            newProgress.progress = 100;
            newProgress.isError = true;
            newProgress.isSuccess = false;

            if (timeoutRefs.current.has(tunnelKey)) {
              clearTimeout(timeoutRefs.current.get(tunnelKey)!);
              timeoutRefs.current.delete(tunnelKey);
            }

            if (!playedSoundRef.current.has(tunnelKey)) {
              playedSoundRef.current.add(tunnelKey);
              const soundEnabled =
                localStorage.getItem("tunnelSoundEnabled") !== "false";
              playTunnelSound("error", soundEnabled);
            }
          } else if (
            message.includes("请尝试将配置文件中tls_enable") &&
            message.includes("改为tls_enable = true")
          ) {
            const errorKey = `${tunnelId}-tls-error`;

            if (processedErrorsRef.current.has(errorKey)) {
              return prev;
            }

            if (!fixingTlsTunnels.has(tunnelId)) {
              processedErrorsRef.current.add(errorKey);
              setTimeout(
                () => {
                  processedErrorsRef.current.delete(errorKey);
                },
                5 * 60 * 1000,
              );

              handleTlsError(tunnelId);
            }
          }

          const updated = new Map(prev).set(tunnelKey, { ...newProgress });
          tunnelProgressCache.set(tunnelId, { ...newProgress });
          return updated;
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [
    fixingTunnels,
    fixingTlsTunnels,
    handleDuplicateTunnelError,
    handleTlsError,
    tunnels,
  ]);

  useEffect(() => {
    const timeouts = timeoutRefs.current;
    const successTimeouts = successTimeoutRefs.current;
    const playedSounds = playedSoundRef.current;
    return () => {
      timeouts.forEach((timeout) => clearTimeout(timeout));
      timeouts.clear();
      successTimeouts.forEach((timeout) => clearTimeout(timeout));
      successTimeouts.clear();
      playedSounds.clear();
    };
  }, []);

  useEffect(() => {
    if (tunnels.length === 0) return;

    const checkRunningStatus = async () => {
      for (const tunnel of tunnels) {
        const tunnelKey = `api_${tunnel.id}`;
        const isRunning = await frpcManager.isTunnelRunning(tunnel.id);
        if (!isRunning) {
          if (runningTunnels.has(tunnelKey)) {
            setTunnelProgress((prev) => {
              const current = prev.get(tunnelKey);
              if (current && current.progress < 100) {
                const errorProgress = {
                  ...current,
                  progress: 100,
                  isError: true,
                  isSuccess: false,
                };
                tunnelProgressCache.set(tunnel.id, errorProgress);
                return new Map(prev).set(tunnelKey, errorProgress);
              }
              return prev;
            });
          } else {
            setTunnelProgress((prev) => {
              const current = prev.get(tunnelKey);
              if (current && current.progress > 0) {
                const cleared = {
                  progress: 0,
                  isError: false,
                  isSuccess: false,
                };
                tunnelProgressCache.set(tunnel.id, cleared);
                return new Map(prev).set(tunnelKey, cleared);
              }
              return prev;
            });
            if (successTimeoutRefs.current.has(tunnelKey)) {
              clearTimeout(successTimeoutRefs.current.get(tunnelKey)!);
              successTimeoutRefs.current.delete(tunnelKey);
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
