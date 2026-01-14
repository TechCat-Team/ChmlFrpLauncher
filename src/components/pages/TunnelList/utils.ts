import type { LogMessage } from "@/services/frpcManager";
import type { TunnelProgress } from "./types";
import { tunnelProgressCache } from "./cache";

export function restoreProgressFromLogs(
  logs: LogMessage[],
): Map<number, TunnelProgress> {
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
