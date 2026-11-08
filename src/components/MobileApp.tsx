import { useEffect, useState } from "react";
import {
  Home as HomeIcon,
  List,
  ScrollText,
  Settings as SettingsIcon,
  Settings2,
  LogIn,
  LogOut,
  LoaderCircle,
  Network,
  Palette,
  Info,
  User,
  Pencil,
  Trash2,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import {
  clearStoredUser,
  createDeviceAuthorization,
  exchangeDeviceCodeForToken,
  fetchTunnels,
  fetchNodes,
  deleteTunnel,
  type Node,
  getStoredUser,
  loginWithAccessToken,
  saveStoredUser,
  type DeviceAuthorizationResponse,
  type StoredUser,
  type Tunnel,
} from "@/services/api";
import { frpcManager } from "@/services/frpcManager";
import { logStore } from "@/services/logStore";
import { Home } from "@/components/pages/Home";
import { Logs } from "@/components/pages/Logs";
import { CreateTunnelDialog } from "@/components/pages/TunnelList/components/CreateTunnelDialog";
import { EditTunnelDialog } from "@/components/pages/TunnelList/components/EditTunnelDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { Select } from "@/components/ui/select";
import {
  getInitialBypassProxy,
  getInitialFrpcLogLevel,
  getInitialRestartOnEdit,
  type FrpcLogLevel,
} from "@/components/pages/Settings/utils";
import { NetworkSection } from "@/components/pages/Settings/components/NetworkSection";
import { useProxy } from "@/components/pages/Settings/hooks/useProxy";
import { useAppTheme } from "@/components/App/hooks/useAppTheme";
import { useAppThemeColor } from "@/components/App/hooks/useAppThemeColor";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Tab = "home" | "tunnels" | "logs" | "settings";
type TunnelStatus = { state: string; error: string };
type ThemeMode = "system" | "light" | "dark";

const nav = [
  { id: "home" as const, label: "首页", icon: HomeIcon },
  { id: "tunnels" as const, label: "隧道", icon: List },
  { id: "logs" as const, label: "日志", icon: ScrollText },
  { id: "settings" as const, label: "设置", icon: SettingsIcon },
];

const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

function getThemeMode(): ThemeMode {
  if (localStorage.getItem("themeFollowSystem") !== "false") return "system";
  return localStorage.getItem("theme") === "dark" ? "dark" : "light";
}

function applyThemeMode(mode: ThemeMode) {
  localStorage.setItem("themeFollowSystem", String(mode === "system"));
  if (mode !== "system") localStorage.setItem("theme", mode);
  window.dispatchEvent(new Event("themeChanged"));
}

/** 与桌面端 TunnelCard 风格一致的隧道卡片，编辑和删除以按钮形式提供（手机上没有右键菜单） */
function MobileTunnelCard({
  tunnel,
  running,
  status,
  busy,
  disabled,
  onToggle,
  onEdit,
  onDelete,
}: {
  tunnel: Tunnel;
  running: boolean;
  status: TunnelStatus | undefined;
  busy: boolean;
  disabled: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const offline = tunnel.nodestate !== "online";
  const isHttp = ["http", "https"].includes(tunnel.type.toLowerCase());
  const link = isHttp ? tunnel.dorp : `${tunnel.ip}:${tunnel.dorp}`;
  const state =
    status?.state === "error"
      ? "error"
      : running
        ? status?.state === "connected"
          ? "connected"
          : "connecting"
        : "stopped";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        isHttp && !link.includes("://")
          ? `${tunnel.type.toLowerCase()}://${link}`
          : link,
      );
      toast.success("链接已复制");
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <div className="rounded-lg overflow-hidden bg-card">
      <div className="h-0.5 w-full bg-muted/20">
        <div
          className={cn(
            "h-full transition-all duration-500",
            state === "connecting" && "w-1/2 bg-primary animate-pulse",
            state === "connected" && "w-full bg-green-500",
            state === "error" && "w-full bg-destructive",
            state === "stopped" && "w-0",
          )}
        />
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className="font-semibold text-foreground truncate text-sm">
                {tunnel.name}
              </h3>
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full flex-shrink-0",
                  offline || state === "error"
                    ? "bg-red-500"
                    : running
                      ? "bg-foreground"
                      : "bg-muted-foreground/30",
                )}
              />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded text-muted-foreground bg-muted/10 uppercase tracking-wider">
                {tunnel.type}
              </span>
              <span className="text-xs text-muted-foreground truncate opacity-80">
                {tunnel.node || "—"}
              </span>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input
              type="checkbox"
              aria-label={running ? "停止隧道" : "启动隧道"}
              checked={running}
              disabled={disabled || (offline && !running)}
              onChange={onToggle}
              className="sr-only peer"
            />
            <div
              className={cn(
                "w-11 h-6 rounded-full transition-colors duration-300",
                running ? "bg-primary" : "bg-muted dark:bg-foreground/12",
                (disabled || (offline && !running)) && "opacity-50",
              )}
            />
            <div
              className={cn(
                "absolute left-[3px] top-[4px] w-4 h-4 bg-background rounded-full shadow-sm transition-transform duration-300",
                running && "translate-x-[20px]",
                busy && "scale-90",
              )}
            />
          </label>
        </div>

        <div className="space-y-2 pt-1 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">本地</span>
            <span className="font-mono text-foreground/80 truncate">
              {tunnel.localip || "—"}:{tunnel.nport}
            </span>
          </div>
          <button
            onClick={() => void copyLink()}
            className="w-full flex items-center justify-between gap-3 -mx-2 px-2 py-1 rounded active:bg-muted/40 transition-colors"
            style={{ width: "calc(100% + 1rem)" }}
          >
            <span className="text-muted-foreground">链接</span>
            <span className="font-mono text-foreground/80 truncate">
              {link}
            </span>
          </button>
          {(state !== "stopped" || offline) && (
            <p
              className={cn(
                "break-words leading-relaxed",
                state === "error" || offline
                  ? "text-destructive"
                  : state === "connected"
                    ? "text-foreground/80"
                    : "text-muted-foreground",
              )}
            >
              {offline && state === "stopped"
                ? "此节点已离线"
                : state === "connected"
                  ? "已连接"
                  : state === "connecting"
                    ? "正在连接节点…"
                    : status?.error || "连接失败"}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-1 mt-3 pt-2 border-t border-border/40">
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={onEdit}
            className="h-8 px-2.5 text-xs text-muted-foreground"
          >
            <Pencil className="size-3.5" />
            编辑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={onDelete}
            className="h-8 px-2.5 text-xs text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            删除
          </Button>
        </div>
      </div>
    </div>
  );
}

export function MobileApp() {
  useAppTheme();
  useAppThemeColor();

  const [tab, setTab] = useState<Tab>("home");
  const [user, setUser] = useState<StoredUser | null>(getStoredUser);
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [session, setSession] = useState<DeviceAuthorizationResponse | null>(
    null,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [statuses, setStatuses] = useState<Record<number, TunnelStatus>>({});
  const [running, setRunning] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<number | null>(null);
  const [nodes, setNodes] = useState<Node[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Tunnel | null>(null);
  const [deleting, setDeleting] = useState<Tunnel | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getThemeMode);
  const [frpcLogLevel, setFrpcLogLevel] = useState<FrpcLogLevel>(
    getInitialFrpcLogLevel,
  );
  const [bypassProxy, setBypassProxy] = useState(getInitialBypassProxy);
  const [restartOnEdit, setRestartOnEdit] = useState(getInitialRestartOnEdit);
  const { proxyConfig, updateProxyConfig } = useProxy();
  const [batteryUnrestricted, setBatteryUnrestricted] = useState<
    boolean | null
  >(null);
  const usertoken = user?.usertoken;

  useEffect(() => {
    void logStore.startListening();
  }, []);

  // 从系统设置返回应用时重新检查电池优化状态
  useEffect(() => {
    const check = () =>
      void invoke<boolean>("is_ignoring_battery_optimizations")
        .then(setBatteryUnrestricted)
        .catch(() => setBatteryUnrestricted(null));
    check();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const ids = await frpcManager.getRunningTunnels();
        const entries = await Promise.all(
          tunnels.map(
            async (t) =>
              [
                t.id,
                await invoke<TunnelStatus>("get_frpc_status", {
                  tunnelId: t.id,
                }),
              ] as const,
          ),
        );
        if (!cancelled) {
          setRunning(new Set(ids));
          setStatuses(Object.fromEntries(entries));
        }
      } catch (err) {
        console.error("刷新隧道状态失败:", err);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tunnels]);

  const toggleTunnel = async (tunnel: Tunnel) => {
    setBusy(tunnel.id);
    try {
      if (running.has(tunnel.id)) {
        await frpcManager.stopTunnel(tunnel.id);
        toast.success("隧道已停止");
      } else {
        if (!user?.usertoken) throw new Error("未找到用户令牌，请重新登录");
        await frpcManager.startTunnel(tunnel, user.usertoken);
        toast.info("隧道已启动，正在连接节点");
      }
      setRunning(new Set(await frpcManager.getRunningTunnels()));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const openEditor = async (tunnel?: Tunnel) => {
    try {
      setLoading(true);
      setNodes(await fetchNodes());
      if (tunnel) setEditing(tunnel);
      else setCreating(true);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(deleting.id);
    try {
      if (running.has(deleting.id)) await frpcManager.stopTunnel(deleting.id);
      await deleteTunnel(deleting.id);
      setDeleting(null);
      setRunning(new Set(await frpcManager.getRunningTunnels()));
      setRevision((v) => v + 1);
      toast.success("隧道已删除");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!usertoken) {
      setTunnels([]);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    fetchTunnels()
      .then((list) => {
        if (active) setTunnels(list);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [usertoken, revision]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    let timer: number | undefined;
    const expires = Date.now() + (session.expires_in ?? 600) * 1000;
    const poll = async (seconds: number) => {
      if (Date.now() >= expires) {
        if (!cancelled) {
          setError("授权已过期，请重新登录");
          setSession(null);
        }
        return;
      }
      try {
        const result = await exchangeDeviceCodeForToken(session.device_code);
        if (cancelled) return;
        if (result.access_token) {
          const account = await loginWithAccessToken(
            result.access_token,
            result,
          );
          if (!cancelled) {
            saveStoredUser(account);
            setUser(account);
            setSession(null);
          }
        } else if (
          result.error === "authorization_pending" ||
          result.error === "slow_down"
        ) {
          const next = seconds + (result.error === "slow_down" ? 5 : 0);
          timer = window.setTimeout(() => void poll(next), next * 1000);
        } else {
          setError(result.error_description || result.error || "授权失败");
          setSession(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "授权失败");
          setSession(null);
        }
      }
    };
    timer = window.setTimeout(
      () => void poll(Math.max(session.interval ?? 3, 3)),
      Math.max(session.interval ?? 3, 3) * 1000,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [session]);

  const login = async () => {
    setError("");
    setLoading(true);
    try {
      const next = await createDeviceAuthorization();
      setSession(next);
      await openUrl(next.verification_uri_complete || next.verification_uri);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法打开授权页面");
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      for (const id of await frpcManager.getRunningTunnels())
        await frpcManager.stopTunnel(id);
    } catch (err) {
      toast.error(`停止隧道失败：${String(err)}`);
      return;
    }
    setRunning(new Set());
    clearStoredUser();
    setUser(null);
    setSession(null);
    setError("");
  };

  // 以下设置与电脑端使用相同的存储键
  const changeBypassProxy = (value: boolean) => {
    setBypassProxy(value);
    localStorage.setItem("bypassProxy", String(value));
  };

  const changeRestartOnEdit = (value: boolean) => {
    setRestartOnEdit(value);
    localStorage.setItem("restartOnEdit", String(value));
  };

  // 启动隧道时写入配置的 log.level
  const changeFrpcLogLevel = (level: FrpcLogLevel) => {
    setFrpcLogLevel(level);
    localStorage.setItem("frpcLogLevel", level);
  };

  const changeThemeMode = (mode: ThemeMode) => {
    setThemeMode(mode);
    applyThemeMode(mode);
  };

  const loginCard = (
    <div className="rounded-2xl bg-card p-6 flex flex-col items-center text-center gap-4">
      <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
        <User className="w-6 h-6 text-primary-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">
          {session ? "等待浏览器授权" : "登录 ChmlFrp"}
        </h2>
        <p className="text-xs text-muted-foreground">
          {session
            ? "请在浏览器完成登录和授权，完成后返回应用"
            : "授权后即可管理和启动你的隧道"}
        </p>
      </div>
      {session ? (
        <>
          <div className="w-full flex flex-col items-center justify-center p-4 rounded-xl bg-muted/30 border border-border/50">
            <span className="text-xs text-muted-foreground mb-1">授权码</span>
            <span className="text-xl font-mono font-bold tracking-widest">
              {session.user_code}
            </span>
          </div>
          <button
            className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium active:scale-[0.98] transition-all"
            onClick={() =>
              void openUrl(
                session.verification_uri_complete || session.verification_uri,
              ).catch(() => setError("无法打开授权页面"))
            }
          >
            重新打开授权页面
          </button>
          <button
            className="w-full rounded-xl border border-border py-2.5 text-sm font-medium text-foreground active:scale-[0.98] transition-all"
            onClick={() => setSession(null)}
          >
            取消授权
          </button>
        </>
      ) : (
        <button
          disabled={loading}
          onClick={() => void login()}
          className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-70 active:scale-[0.98] transition-all"
        >
          {loading ? (
            <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
          ) : (
            <LogIn className="w-4 h-4" />
          )}
          {loading ? "正在连接" : "授权登录"}
        </button>
      )}
    </div>
  );

  const sectionTitle = (Icon: typeof Info, label: string) => (
    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </div>
  );

  return (
    <div className="mobile-app h-dvh bg-background text-foreground flex flex-col">
      {/* 状态栏背景：页面滚动时内容不会显示在状态栏下方 */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[env(safe-area-inset-top)] bg-background"
      />
      <main
        className={cn(
          "flex-1 min-h-0 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4",
          tab === "logs" ? "flex flex-col" : "overflow-y-auto",
        )}
      >
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive px-3 py-2.5 text-xs break-words"
          >
            {error}
          </div>
        )}

        {tab === "home" &&
          (user ? (
            <Home user={user} onUserChange={setUser} />
          ) : (
            <div className="flex flex-col gap-4">
              <h1 className="text-xl font-medium text-foreground">首页</h1>
              {loginCard}
            </div>
          ))}

        {tab === "tunnels" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-medium text-foreground">隧道</h1>
                {loading ? (
                  <LoaderCircle
                    className="size-3.5 animate-spin text-muted-foreground"
                    aria-label="正在刷新隧道"
                  />
                ) : (
                  user && (
                    <span className="text-xs text-muted-foreground">
                      {tunnels.length} 个
                    </span>
                  )
                )}
              </div>
              {user && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loading}
                    onClick={() => setRevision((v) => v + 1)}
                    className="h-8 px-3 text-xs"
                  >
                    刷新
                  </Button>
                  <Button
                    size="sm"
                    disabled={loading}
                    onClick={() => void openEditor()}
                    className="h-8 px-3 text-xs"
                  >
                    新建隧道
                  </Button>
                </div>
              )}
            </div>
            {!user ? (
              loginCard
            ) : loading && !tunnels.length ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                加载中...
              </div>
            ) : !tunnels.length ? (
              <Empty className="py-16">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Network className="size-6" />
                  </EmptyMedia>
                  <EmptyTitle>暂无隧道</EmptyTitle>
                  <EmptyDescription>
                    点击右上角“新建隧道”创建你的第一个隧道。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {tunnels.map((t) => (
                  <MobileTunnelCard
                    key={t.id}
                    tunnel={t}
                    running={running.has(t.id)}
                    status={statuses[t.id]}
                    busy={busy === t.id}
                    disabled={busy !== null}
                    onToggle={() => void toggleTunnel(t)}
                    onEdit={() => void openEditor(t)}
                    onDelete={() => setDeleting(t)}
                  />
                ))}
                {batteryUnrestricted === false && (
                  <button
                    onClick={() => setTab("settings")}
                    className="text-[11px] text-muted-foreground text-center pt-1 underline-offset-2 active:underline"
                  >
                    未允许忽略电池优化，锁屏后隧道可能中断，点此前往设置
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "logs" && <Logs />}

        {tab === "settings" && (
          <div className="flex flex-col gap-6">
            <h1 className="text-xl font-medium text-foreground">设置</h1>

            <div className="space-y-3">
              {sectionTitle(User, "账户")}
              <div className="rounded-lg bg-card overflow-hidden">
                <Item variant="outline" className="border-0">
                  <ItemContent>
                    <ItemTitle>{user ? user.username : "尚未登录"}</ItemTitle>
                    <ItemDescription className="text-xs">
                      {user
                        ? user.usergroup || "ChmlFrp 账户"
                        : "在首页授权登录后管理隧道"}
                    </ItemDescription>
                  </ItemContent>
                  {user && (
                    <ItemActions>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void logout()}
                        className="h-8 px-3 text-xs text-destructive hover:text-destructive"
                      >
                        <LogOut className="size-3.5" />
                        退出登录
                      </Button>
                    </ItemActions>
                  )}
                </Item>
              </div>
            </div>

            <NetworkSection
              bypassProxy={bypassProxy}
              setBypassProxy={changeBypassProxy}
              proxyConfig={proxyConfig}
              updateProxyConfig={updateProxyConfig}
            />

            <div className="space-y-3">
              {sectionTitle(Palette, "外观")}
              <div className="rounded-lg bg-card overflow-hidden">
                <Item variant="outline" className="border-0">
                  <ItemContent>
                    <ItemTitle>主题模式</ItemTitle>
                    <ItemDescription className="text-xs">
                      跟随系统或手动选择浅色、深色
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <div className="flex rounded-lg bg-muted/50 p-0.5">
                      {(
                        [
                          ["system", "系统"],
                          ["light", "浅色"],
                          ["dark", "深色"],
                        ] as const
                      ).map(([mode, label]) => (
                        <button
                          key={mode}
                          onClick={() => changeThemeMode(mode)}
                          className={cn(
                            "px-2.5 py-1 text-xs rounded-md transition-colors",
                            themeMode === mode
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </ItemActions>
                </Item>
              </div>
            </div>

            <div className="space-y-3">
              {sectionTitle(Settings2, "隧道")}
              <div className="rounded-lg bg-card overflow-hidden">
                <Item variant="outline" className="border-0">
                  <ItemContent>
                    <ItemTitle>Frpc 日志等级</ItemTitle>
                    <ItemDescription className="text-xs">
                      控制日志页显示的详细程度，重新启动隧道后生效
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Select
                      options={[
                        { value: "trace", label: "trace" },
                        { value: "debug", label: "debug" },
                        { value: "info", label: "info" },
                        { value: "warn", label: "warn" },
                        { value: "error", label: "error" },
                      ]}
                      value={frpcLogLevel}
                      onChange={(value) =>
                        changeFrpcLogLevel(value as FrpcLogLevel)
                      }
                      size="sm"
                      className="w-24"
                    />
                  </ItemActions>
                </Item>
                <ItemSeparator />
                <Item variant="outline" className="border-0">
                  <ItemContent>
                    <ItemTitle>修改隧道后重启映射</ItemTitle>
                    <ItemDescription className="text-xs">
                      修改正在运行的隧道后自动重启以应用更改
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <button
                      onClick={() => changeRestartOnEdit(!restartOnEdit)}
                      className={cn(
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                        restartOnEdit
                          ? "bg-primary"
                          : "bg-muted dark:bg-foreground/12",
                      )}
                      role="switch"
                      aria-checked={restartOnEdit}
                      aria-label="修改隧道后重启映射"
                    >
                      <span
                        className={cn(
                          "inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform",
                          restartOnEdit ? "translate-x-6" : "translate-x-1",
                        )}
                      />
                    </button>
                  </ItemActions>
                </Item>
                <ItemSeparator />
                <Item variant="outline" className="border-0">
                  <ItemContent>
                    <ItemTitle>前台服务保活</ItemTitle>
                    <ItemDescription className="text-xs">
                      有隧道运行时在通知栏显示常驻通知，降低应用在后台被系统回收的概率
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <span className="text-xs text-muted-foreground">
                      {running.size > 0 ? "运行中" : "未启动"}
                    </span>
                  </ItemActions>
                </Item>
                <ItemSeparator />
                <Item variant="outline" className="border-0">
                  <ItemContent>
                    <ItemTitle>忽略电池优化</ItemTitle>
                    <ItemDescription className="text-xs">
                      {batteryUnrestricted === null
                        ? "正在检查…"
                        : batteryUnrestricted
                          ? "已允许，锁屏后隧道可持续运行"
                          : "未允许，锁屏或省电时隧道可能被系统暂停"}
                    </ItemDescription>
                  </ItemContent>
                  {batteryUnrestricted === false && (
                    <ItemActions>
                      <Button
                        size="sm"
                        onClick={() =>
                          void invoke(
                            "request_ignore_battery_optimizations",
                          ).catch((err) => toast.error(errorMessage(err)))
                        }
                        className="h-8 px-3 text-xs"
                      >
                        去允许
                      </Button>
                    </ItemActions>
                  )}
                </Item>
                <ItemSeparator />
                <Item variant="outline" className="border-0">
                  <ItemContent>
                    <ItemTitle>自启动与后台运行</ItemTitle>
                    <ItemDescription className="text-xs">
                      小米、OPPO、vivo、华为等系统需在应用设置中手动允许后台运行
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void invoke("open_app_settings").catch((err) =>
                          toast.error(errorMessage(err)),
                        )
                      }
                      className="h-8 px-3 text-xs"
                    >
                      应用设置
                    </Button>
                  </ItemActions>
                </Item>
                <ItemSeparator />
                <Item variant="outline" className="border-0">
                  <ItemContent>
                    <ItemTitle>运行中的隧道</ItemTitle>
                    <ItemDescription className="text-xs">
                      {running.size} 个隧道正在运行或尝试连接
                    </ItemDescription>
                  </ItemContent>
                </Item>
              </div>
            </div>

            <div className="space-y-3">
              {sectionTitle(Info, "关于")}
              <div className="rounded-lg bg-card overflow-hidden">
                <Item variant="outline" className="border-0">
                  <ItemContent>
                    <ItemTitle>ChmlFrp Launcher</ItemTitle>
                    <ItemDescription className="text-xs">
                      Android 预览版
                    </ItemDescription>
                  </ItemContent>
                </Item>
              </div>
            </div>
          </div>
        )}
      </main>

      <CreateTunnelDialog
        mobile
        open={creating}
        onOpenChange={setCreating}
        onSuccess={() => setRevision((v) => v + 1)}
        preloadedNodes={nodes}
        user={user}
      />
      <EditTunnelDialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSuccess={() => {
          // 是否重启由对话框按“修改隧道后重启映射”设置处理，这里只刷新列表和状态
          if (editing && running.has(editing.id) && !restartOnEdit) {
            toast.info("隧道配置已更新，重新启动隧道后生效");
          }
          void frpcManager
            .getRunningTunnels()
            .then((ids) => setRunning(new Set(ids)))
            .catch(() => undefined);
          setRevision((v) => v + 1);
        }}
        tunnel={editing}
        preloadedNodes={nodes}
        user={user}
      />
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && busy === null) setDeleting(null);
        }}
      >
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除隧道</DialogTitle>
            <DialogDescription className="break-all">
              确定删除“{deleting?.name}”吗？此操作会删除账户中的隧道。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => setDeleting(null)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy !== null}
              onClick={() => void confirmDelete()}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <nav
        aria-label="主导航"
        className="flex bg-card/95 backdrop-blur-xl border-t border-border/50 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        {nav.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 py-1 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "px-4 py-1 rounded-xl transition-colors",
                  active && "bg-primary/10",
                )}
              >
                <item.icon className="w-[18px] h-[18px]" />
              </span>
              <span className="tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
