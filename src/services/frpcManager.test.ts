import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { Tunnel } from "./api";
import { FrpcManager, type LogMessage, type TunnelConfig } from "./frpcManager";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const tunnel = {
  id: 42,
  name: "test",
  type: "tcp",
  localip: "127.0.0.1",
  nport: 8080,
  dorp: "9000",
  node_ip: "127.0.0.1",
  server_port: 7000,
  node_token: "node-token",
} as Tunnel;

const desktopStart = "[I] [ChmlFrpLauncher] frpc 进程已启动 (PID: 42), 开始连接服务器...";
const androidStart = "[I] [ChmlFrpLauncher] 隧道已启动，正在连接 127.0.0.1:7000 ...";
const ready = "[I] [client/control.go:165] [test] start proxy success";
const loginFailed = (reason: string) =>
  `[ERR] login to the server failed: ${reason}. With loginFailExit enabled, no additional retries will be attempted`;

describe("automatic TLS retry", () => {
  let manager: FrpcManager;
  let emit: (message: string, tunnelId?: number) => void;
  const getSetting = vi.fn();

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    getSetting.mockReturnValue(null);
    vi.stubGlobal("localStorage", { getItem: getSetting });
    vi.mocked(invoke).mockResolvedValue("ok");
    vi.mocked(listen<LogMessage>).mockImplementation(async (event, callback) => {
      emit = (message, tunnelId = tunnel.id) => {
        callback({
          event,
          id: 1,
          payload: { tunnel_id: tunnelId, message, timestamp: "same-second" },
        });
      };
      return () => {};
    });
    manager = new FrpcManager();
    await manager.listenToLogs(vi.fn());
  });

  afterEach(() => {
    manager.stopListening();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    loginFailed("i/o deadline reached"),
    loginFailed("EOF"),
    loginFailed("read tcp 127.0.0.1: connection reset by peer"),
    loginFailed("session shutdown"),
    loginFailed("wsasend: An existing connection was forcibly closed by the remote host"),
    loginFailed("dial tcp 127.0.0.1:7000: i/o timeout"),
    "请尝试将配置文件中tls_enable改为tls_enable = true",
  ])("retries once with TLS for %s", async (message) => {
    await manager.startTunnel(tunnel, "user-token");
    emit(desktopStart);
    emit(message);
    emit(message);
    await vi.advanceTimersByTimeAsync(0);

    const { config } = vi.mocked(invoke).mock.calls[0][1] as {
      config: TunnelConfig;
    };
    expect(config.force_tls).toBe(false);
    expect(invoke).toHaveBeenNthCalledWith(2, "stop_frpc", { tunnelId: tunnel.id });
    expect(invoke).toHaveBeenNthCalledWith(3, "start_frpc", {
      config: { ...config, force_tls: true },
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();

    emit(loginFailed("EOF"));
    emit(ready);
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    emit(desktopStart);
    emit(ready, tunnel.id + 1);
    expect(toast.success).not.toHaveBeenCalled();
    emit(ready);
    expect(toast.success).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it("handles Android failure logs and reports a failed retry without looping", async () => {
    await manager.startTunnel(tunnel, "user-token");
    emit(androidStart);
    emit("[E] [ChmlFrpLauncher] 连接已中断：EOF");
    await vi.advanceTimersByTimeAsync(0);
    emit(androidStart);
    emit("[E] [ChmlFrpLauncher] TLS 握手失败，请尝试切换强制 TLS 设置：remote error: tls: handshake failure");
    await vi.advanceTimersByTimeAsync(0);

    expect(toast.error).toHaveBeenCalledOnce();
    expect(toast.success).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it("ignores unrelated EOFs and does not retry authentication failures", async () => {
    await manager.startTunnel(tunnel, "user-token");
    emit(loginFailed("EOF"));
    emit(desktopStart);
    emit("[W] [client/proxy.go] local connection: EOF");
    emit(loginFailed("token in login doesn't match token from configuration"));
    await vi.advanceTimersByTimeAsync(0);

    expect(invoke).toHaveBeenCalledOnce();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("does not retry an attempt that already has TLS enabled", async () => {
    getSetting.mockImplementation((key) =>
      key === "frpc_proxy_config" ? '{"forceTls":true}' : null,
    );
    await manager.startTunnel(tunnel, "user-token");
    emit(desktopStart);
    emit(loginFailed("EOF"));
    await vi.advanceTimersByTimeAsync(0);
    expect(invoke).toHaveBeenCalledOnce();
  });

  it("does not report success if no result arrives for the retry", async () => {
    await manager.startTunnel(tunnel, "user-token");
    emit(desktopStart);
    emit(loginFailed("EOF"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(toast.warning).toHaveBeenCalledOnce();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("cancels the pending retry when the user stops the tunnel", async () => {
    await manager.startTunnel(tunnel, "user-token");
    emit(desktopStart);
    emit(loginFailed("EOF"));
    await manager.stopTunnel(tunnel.id);

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenLastCalledWith("stop_frpc", { tunnelId: tunnel.id });
  });
});
