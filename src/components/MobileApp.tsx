import { useEffect, useState } from "react";
import {
  Home,
  List,
  Settings,
  RefreshCw,
  LogIn,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  clearStoredUser,
  createDeviceAuthorization,
  exchangeDeviceCodeForToken,
  fetchTunnels,
  fetchUserInfo,
  getStoredUser,
  loginWithAccessToken,
  saveStoredUser,
  type DeviceAuthorizationResponse,
  type StoredUser,
  type Tunnel,
  type UserInfo,
} from "@/services/api";

export function MobileApp() {
  const [tab, setTab] = useState<"home" | "tunnels" | "settings">("home");
  const [user, setUser] = useState<StoredUser | null>(getStoredUser);
  const [info, setInfo] = useState<UserInfo | null>(null);
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [session, setSession] = useState<DeviceAuthorizationResponse | null>(
    null,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!user) {
      setInfo(null);
      setTunnels([]);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([fetchUserInfo(), fetchTunnels()])
      .then(([profile, list]) => {
        if (active) {
          setInfo(profile);
          setTunnels(list);
        }
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
  }, [user, revision]);

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
  const logout = () => {
    clearStoredUser();
    setUser(null);
    setSession(null);
    setError("");
  };
  const nav = [
    { id: "home" as const, label: "首页", icon: Home },
    { id: "tunnels" as const, label: "隧道", icon: List },
    { id: "settings" as const, label: "设置", icon: Settings },
  ];
  return (
    <div className="mobile-app h-dvh bg-background text-foreground flex flex-col">
      <header className="px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium">
            CHMLFRP LAUNCHER
          </p>
          <h1 className="text-2xl font-bold mt-1">
            {nav.find((item) => item.id === tab)?.label}
          </h1>
        </div>
        {user && (
          <button
            aria-label="刷新"
            className="rounded-full p-3 bg-card"
            disabled={loading}
            onClick={() => setRevision((v) => v + 1)}
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        )}
      </header>
      <main className="flex-1 min-h-0 overflow-y-auto px-5 pb-6 space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded-2xl bg-destructive/10 text-destructive p-4 text-sm break-words"
          >
            {error}
          </div>
        )}
        {session && (
          <section className="rounded-2xl bg-card p-5 space-y-3">
            <h2 className="font-semibold">等待浏览器授权</h2>
            <p className="text-sm text-muted-foreground">
              请在浏览器完成登录和授权，完成后返回应用。
            </p>
            <p className="text-center text-xl font-mono font-bold tracking-widest">
              {session.user_code}
            </p>
            <button
              className="text-sm underline"
              onClick={() =>
                void openUrl(
                  session.verification_uri_complete || session.verification_uri,
                ).catch(() => setError("无法打开授权页面"))
              }
            >
              重新打开授权页面
            </button>
            <button
              className="block text-sm text-muted-foreground"
              onClick={() => setSession(null)}
            >
              取消授权
            </button>
          </section>
        )}
        {tab === "home" && (
          <>
            <section className="rounded-3xl bg-primary text-primary-foreground p-6 space-y-2">
              <p className="text-sm opacity-70">欢迎使用 ChmlFrp</p>
              <h2 className="text-2xl font-semibold">
                {user
                  ? `你好，${info?.username || user.username}`
                  : "连接更多可能"}
              </h2>
              <p className="text-sm opacity-75">
                在手机上查看你的账户和隧道信息。
              </p>
            </section>
            {user ? (
              <section className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-card p-5">
                  <p className="text-sm text-muted-foreground">隧道数量</p>
                  <p className="text-2xl font-semibold mt-2">
                    {info?.tunnelCount ?? tunnels.length}
                  </p>
                </div>
                <div className="rounded-2xl bg-card p-5">
                  <p className="text-sm text-muted-foreground">账户组</p>
                  <p className="text-lg font-semibold mt-2 break-words">
                    {info?.usergroup || user.usergroup || "—"}
                  </p>
                </div>
              </section>
            ) : (
              <section className="rounded-2xl bg-card p-5">
                <h2 className="font-semibold">登录账户</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  授权后查看账户及隧道列表。
                </p>
                <button
                  disabled={loading || !!session}
                  onClick={() => void login()}
                  className="mt-4 rounded-xl bg-primary text-primary-foreground px-5 py-3 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                >
                  <LogIn size={16} />
                  {loading ? "正在连接" : "授权登录"}
                </button>
              </section>
            )}
            <section className="rounded-2xl bg-card p-5">
              <h2 className="font-semibold">Android 预览版</h2>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                目前支持账户和隧道信息展示，隧道启动、停止及管理功能暂不可用。
              </p>
            </section>
          </>
        )}
        {tab === "tunnels" && (
          <>
            <div className="rounded-2xl bg-secondary p-4 text-sm text-muted-foreground">
              当前仅展示账户隧道，Android 暂不支持控制隧道。
            </div>
            {!user ? (
              <p className="text-sm text-muted-foreground p-3">
                请先在首页登录账户。
              </p>
            ) : loading && !tunnels.length ? (
              <p className="p-3 text-sm">正在加载…</p>
            ) : !tunnels.length ? (
              <p className="p-3 text-sm text-muted-foreground">暂无隧道</p>
            ) : (
              tunnels.map((t) => (
                <article
                  key={t.id}
                  className="rounded-2xl bg-card p-5 space-y-3"
                >
                  <div className="flex justify-between gap-3">
                    <h2 className="font-semibold break-all">{t.name}</h2>
                    <span className="text-xs rounded-full bg-secondary px-3 py-1 h-fit">
                      {t.type}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1 break-all">
                    <p>节点：{t.node || "—"}</p>
                    <p>
                      本地地址：{t.localip || "—"}:{t.nport}
                    </p>
                    <p>远程地址：{t.dorp || "—"}</p>
                  </div>
                </article>
              ))
            )}
          </>
        )}
        {tab === "settings" && (
          <>
            <section className="rounded-2xl bg-card overflow-hidden">
              <div className="p-5">
                <h2 className="font-semibold">账户</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {user ? user.username : "尚未登录"}
                </p>
              </div>
              {user && (
                <button
                  onClick={logout}
                  className="border-t border-border w-full p-5 flex items-center gap-2 text-sm text-destructive"
                >
                  <LogOut size={17} />
                  退出登录
                  <ChevronRight size={16} className="ml-auto" />
                </button>
              )}
            </section>
            <section className="rounded-2xl bg-card p-5">
              <h2 className="font-semibold">关于</h2>
              <p className="text-sm text-muted-foreground mt-2">
                ChmlFrp Launcher · Android 预览版
              </p>
            </section>
          </>
        )}
      </main>
      <nav
        aria-label="主导航"
        className="flex bg-card border-t border-border pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        {nav.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? "page" : undefined}
            className={`flex-1 flex flex-col items-center gap-1 pt-3 text-xs ${tab === item.id ? "text-foreground font-semibold" : "text-muted-foreground"}`}
          >
            <item.icon size={21} />
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
