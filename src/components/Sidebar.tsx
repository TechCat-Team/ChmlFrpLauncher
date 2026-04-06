import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  Home as HomeIcon,
  List,
  ScrollText,
  Settings as SettingsIcon,
  X,
  LogIn,
  LogOut,
  User,
  Network,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  clearStoredUser,
  createDeviceAuthorization,
  exchangeDeviceCodeForToken,
  loginWithAccessToken,
  saveStoredUser,
  type DeviceAuthorizationResponse,
  type StoredUser,
} from "@/services/api";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { SidebarMode } from "./pages/Settings/types";
import { getInitialEffectType, type EffectType } from "./pages/Settings/utils";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  user: StoredUser | null;
  onUserChange: (user: StoredUser | null) => void;
  collapsed?: boolean;
  onCollapseChange?: (collapsed: boolean) => void;
  collapsedWidth?: number;
  mode?: SidebarMode;
}

export function Sidebar({
  activeTab,
  onTabChange,
  user,
  onUserChange,
  collapsed: collapsedProp,
  onCollapseChange: onCollapseChangeProp,
  collapsedWidth,
  mode = "classic",
}: SidebarProps) {
  const [showTitleBar, setShowTitleBar] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const isMacOS = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const stored = localStorage.getItem("showTitleBar");
    if (stored === null) return !isMacOS;
    return stored === "true";
  });

  const [effectType, setEffectType] = useState<EffectType>(() =>
    getInitialEffectType(),
  );

  useEffect(() => {
    const handleTitleBarVisibilityChange = () => {
      const stored = localStorage.getItem("showTitleBar");
      setShowTitleBar(stored !== "false");
    };

    const handleEffectTypeChange = () => {
      const stored = localStorage.getItem("effectType");
      if (
        stored === "frosted" ||
        stored === "translucent" ||
        stored === "none"
      ) {
        setEffectType(stored);
      }
    };

    window.addEventListener(
      "titleBarVisibilityChanged",
      handleTitleBarVisibilityChange,
    );
    window.addEventListener("effectTypeChanged", handleEffectTypeChange);
    return () => {
      window.removeEventListener(
        "titleBarVisibilityChanged",
        handleTitleBarVisibilityChange,
      );
      window.removeEventListener("effectTypeChanged", handleEffectTypeChange);
    };
  }, []);

  const [loginOpen, setLoginOpen] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState("");
  const [authSession, setAuthSession] =
    useState<DeviceAuthorizationResponse | null>(null);
  const [authMessage, setAuthMessage] = useState(
    "将在浏览器中打开授权页面",
  );
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const pollingTimerRef = useRef<number | null>(null);

  // 点击外部关闭用户菜单
  useEffect(() => {
    if (!userMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setUserMenuOpen(false);
        if (mode !== "classic") {
          setCollapsedState(true);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [userMenuOpen, mode]);

  const stopPolling = () => {
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    setPolling(false);
  };

  const resetLoginFlow = () => {
    stopPolling();
    setLoading(false);
    setError("");
    setAuthSession(null);
    setAuthMessage("将在浏览器中打开授权页面");
  };

  const closeLoginDialog = () => {
    setLoginOpen(false);
    resetLoginFlow();
  };

  const finishLogin = async (
    accessToken: string,
    options?: {
      refreshToken?: string;
      expiresIn?: number;
      tokenType?: string;
    },
  ) => {
    const authedUser = await loginWithAccessToken(accessToken, {
      refresh_token: options?.refreshToken,
      expires_in: options?.expiresIn,
      token_type: options?.tokenType,
    });
    onUserChange(authedUser);
    if (rememberMe) {
      saveStoredUser(authedUser);
    }
    stopPolling();
    setUserMenuOpen(false);
    closeLoginDialog();
  };

  const scheduleTokenPolling = (deviceCode: string, intervalSeconds: number) => {
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
    }

    pollingTimerRef.current = window.setTimeout(() => {
      void pollToken(deviceCode, intervalSeconds);
    }, intervalSeconds * 1000);
  };

  const pollToken = async (deviceCode: string, intervalSeconds: number) => {
    setPolling(true);
    try {
      const tokenResponse = await exchangeDeviceCodeForToken(deviceCode);

      if (tokenResponse.access_token) {
        await finishLogin(tokenResponse.access_token, {
          refreshToken: tokenResponse.refresh_token,
          expiresIn: tokenResponse.expires_in,
          tokenType: tokenResponse.token_type,
        });
        return;
      }

      if (tokenResponse.error === "authorization_pending") {
        setAuthMessage("请在浏览器中确认授权");
        scheduleTokenPolling(deviceCode, intervalSeconds);
        return;
      }

      if (tokenResponse.error === "slow_down") {
        const nextInterval = intervalSeconds + 5;
        setAuthMessage("连接受限，正在自动重试...");
        scheduleTokenPolling(deviceCode, nextInterval);
        return;
      }

      if (tokenResponse.error === "expired_token") {
        stopPolling();
        setError("这次设备授权已过期，请重新开始登录。");
        return;
      }

      if (tokenResponse.error === "access_denied") {
        stopPolling();
        setError("你已取消本次授权，请重新开始登录。");
        return;
      }

      throw new Error(
        tokenResponse.error_description ||
          tokenResponse.error ||
          "获取访问令牌失败",
      );
    } catch (err) {
      stopPolling();
      setError(err instanceof Error ? err.message : "登录失败");
    }
  };

  const openVerificationPage = async (
    session: DeviceAuthorizationResponse | null,
  ) => {
    if (!session) {
      setError("请先开始设备授权。");
      return;
    }

    const target =
      session.verification_uri_complete || session.verification_uri;

    if (!target) {
      setError("账户中心未返回可用的验证地址。");
      return;
    }

    if (session.user_code) {
      navigator.clipboard?.writeText(session.user_code).catch(() => undefined);
    }

    try {
      await openUrl(target);
      setAuthMessage("请在浏览器中完成授权");
    } catch {
      setAuthMessage("请手动打开验证页面完成授权");
    }
  };

  const startDeviceLogin = async () => {
    stopPolling();
    setLoading(true);
    setError("");
    setAuthMessage("正在获取授权信息...");

    try {
      const session = await createDeviceAuthorization();
      setAuthSession(session);
      await openVerificationPage(session);
      const intervalSeconds = Math.max(Number(session.interval || 5), 1);
      void pollToken(session.device_code, intervalSeconds);
    } catch (err) {
      stopPolling();
      setAuthSession(null);
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  const menuItems = [
    { id: "home", label: "首页", icon: HomeIcon },
    { id: "tunnels", label: "隧道", icon: List },
    { id: "node-test", label: "节点测试", icon: Network },
    { id: "logs", label: "日志", icon: ScrollText },
    { id: "settings", label: "设置", icon: SettingsIcon },
  ];

  const handleMenuClick = (itemId: string) => {
    setError("");
    onTabChange(itemId);
  };

  const isMacOS =
    typeof navigator !== "undefined" &&
    navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(false);
  const isControlled = typeof collapsedProp !== "undefined";
  const collapsed = isControlled ? !!collapsedProp : internalCollapsed;
  const setCollapsedState = (v: boolean) => {
    if (isControlled) {
      onCollapseChangeProp?.(v);
    } else {
      setInternalCollapsed(v);
    }
  };

  const leaveTimerRef = useRef<number | null>(null);
  const animationTimeoutRef = useRef<number | null>(null);

  const handleMouseEnter = () => {
    if (mode !== "floating") return;
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
    }
    setCollapsedState(false);
    animationTimeoutRef.current = window.setTimeout(() => {
      animationTimeoutRef.current = null;
    }, 300);
  };

  const handleMouseLeave = () => {
    if (mode !== "floating" && mode !== "floating_fixed") return;
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
    }
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
    }
    leaveTimerRef.current = window.setTimeout(() => {
      setCollapsedState(true);
      setUserMenuOpen(false);
      leaveTimerRef.current = null;
      animationTimeoutRef.current = window.setTimeout(() => {
        animationTimeoutRef.current = null;
      }, 450);
    }, 200);
  };

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = null;
      }
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, []);

  // Shared Dialog Component
  const LoginDialog = (
    <Dialog
      open={loginOpen}
      onOpenChange={(open) => {
        setLoginOpen(open);
        if (!open) {
          resetLoginFlow();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="z-[10000] w-full max-w-[360px] overflow-hidden rounded-2xl bg-card/95 backdrop-blur-xl border border-border/50 p-0 shadow-2xl data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:slide-in-from-bottom-4"
      >
        {/* 顶部视觉区域 */}
        <div className="relative h-24 bg-gradient-to-br from-primary/5 via-background to-background flex items-center justify-center overflow-hidden">
          <button
            type="button"
            className="absolute top-4 right-4 h-8 w-8 rounded-full bg-foreground/5 hover:bg-foreground/10 transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground z-10"
            onClick={closeLoginDialog}
          >
            <X className="w-4 h-4" />
          </button>
          <div className="relative h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
            <LogIn className="w-5 h-5 text-primary-foreground" />
          </div>
        </div>

        {/* 主体内容 */}
        <div className="px-6 pb-6 pt-0 space-y-5">
          <div className="text-center space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">欢迎回来</h2>
            <p className="text-xs text-muted-foreground">通过浏览器安全地登录你的账户</p>
          </div>

          {!authSession ? (
            <div className="flex flex-col gap-3 pt-2">
              <button
                type="button"
                disabled={loading}
                onClick={startDeviceLogin}
                className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-70 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    正在连接...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    授权登录
                  </span>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-muted/30 border border-border/50">
                <span className="text-xs font-medium text-muted-foreground mb-1.5">你的设备码</span>
                <span className="font-mono text-2xl font-bold tracking-widest text-foreground">
                  {authSession.user_code || "-"}
                </span>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => void openVerificationPage(authSession)}
                  className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 transition-all active:scale-[0.98]"
                >
                  在浏览器中打开授权页
                </button>
                {polling && (
                  <button
                    type="button"
                    onClick={stopPolling}
                    className="w-full rounded-xl border border-border bg-transparent py-2.5 text-sm font-medium text-foreground hover:bg-muted/50 transition-all active:scale-[0.98]"
                  >
                    取消
                  </button>
                )}
              </div>

              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground h-4">
                {polling ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    等待授权完成...
                  </>
                ) : (
                  <span className="text-center">{authMessage}</span>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-2 pt-1">
            <input
              type="checkbox"
              id="rememberMe"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-2 focus:ring-primary/20 cursor-pointer accent-primary transition-all"
            />
            <label
              htmlFor="rememberMe"
              className="text-xs text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
            >
              保持登录状态
            </label>
          </div>

          {error && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2.5 animate-in fade-in zoom-in-95 duration-200">
              <p className="text-xs text-center text-destructive font-medium">{error}</p>
            </div>
          )}
        </div>

        {/* 底部链接 */}
        {!authSession && (
          <div className="px-6 py-3 bg-muted/20 border-t border-border/50">
            <p className="text-xs text-center text-muted-foreground">
              还没有账号？{" "}
              <button
                onClick={() => openUrl("https://www.chmlfrp.net")}
                className="text-primary font-medium hover:underline transition-all"
              >
                立即注册
              </button>
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  if (mode === "classic") {
    const isFrosted = effectType === "frosted";
    return (
      <div
        className={cn(
          "w-56 flex flex-col h-full relative bg-card",
          isFrosted && "backdrop-blur-md",
        )}
      >
        {isMacOS && !showTitleBar ? (
          <div
            data-tauri-drag-region
            className="h-8 flex-shrink-0 flex items-start pt-3 pl-5"
          />
        ) : null}
        <div
          className={cn(
            "px-6 pb-6",
            isMacOS && !showTitleBar ? "pt-4" : "pt-8",
          )}
          {...(isMacOS && !showTitleBar && { "data-tauri-drag-region": true })}
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md">
              <span className="text-primary-foreground font-bold text-base">
                CF
              </span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">
                ChmlFrp
              </h1>
              <p className="text-[10px] text-muted-foreground tracking-wide font-medium">
                LAUNCHER
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-2">
          <ul className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => handleMenuClick(item.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium group relative overflow-hidden",
                      isActive
                        ? "bg-primary/10 text-primary shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                    )}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-primary rounded-r-full" />
                    )}
                    <Icon
                      className={cn(
                        "w-[18px] h-[18px] transition-transform duration-200",
                        isActive ? "text-primary" : "group-hover:scale-110",
                      )}
                    />
                    <span className="tracking-tight">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div
          className="p-4 border-t border-border/30 relative"
          ref={userMenuRef}
        >
          <button
            className="w-full p-2 text-left hover:bg-muted/50 transition-all duration-200 flex items-center gap-3 rounded-xl group relative"
            onClick={() => {
              if (user) {
                setUserMenuOpen((v) => !v);
              } else {
                setError("");
                setLoginOpen(true);
              }
            }}
          >
            {user?.userimg ? (
              <img
                src={user.userimg}
                alt={user.username}
                className="h-10 w-10 rounded-xl object-cover ring-2 ring-primary/10 group-hover:ring-primary/20 transition-all"
              />
            ) : (
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-muted to-muted/80 flex items-center justify-center shadow-sm group-hover:shadow transition-shadow">
                <LogIn className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-semibold text-foreground truncate">
                {user?.username ?? "未登录"}
              </h1>
              <p className="text-[11px] text-muted-foreground truncate">
                {user?.usergroup ?? "点击登录"}
              </p>
            </div>
          </button>

          {user && userMenuOpen && (
            <div
              className={cn(
                "absolute left-4 right-4 bottom-[calc(100%+8px)] rounded-xl border border-border/40 shadow-xl z-10 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 bg-card",
                effectType === "frosted" && "backdrop-blur-md",
              )}
            >
              <div className="p-1">
                <button
                  className="w-full text-left text-sm text-foreground px-3 py-2 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-all duration-200 flex items-center gap-2 group"
                  onClick={() => {
                    onUserChange(null);
                    setUserMenuOpen(false);
                    clearStoredUser();
                    onTabChange("home");
                  }}
                >
                  <LogOut className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  <span className="font-medium">退出登录</span>
                </button>
              </div>
            </div>
          )}
        </div>
        {LoginDialog}
      </div>
    );
  }

  const isFrosted = effectType === "frosted";
  return (
    <>
      <div
        className={cn(
          "relative h-full overflow-hidden animate-in slide-in-from-left-2 duration-300 floating-sidebar bg-card",
          isFrosted && "backdrop-blur-md",
        )}
        style={{
          borderRadius: "18px",
          transition: "width 0.5s cubic-bezier(0.32, 0.72, 0, 1)",
          width: collapsed ? `${collapsedWidth ?? 66}px` : "224px",
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className="absolute inset-0 bg-gradient-to-r from-sidebar/20 via-sidebar/10 to-transparent pointer-events-none"
          style={{ borderRadius: "18px" }}
        />

        <div
          className="relative flex flex-col h-full z-10"
          style={{ borderRadius: "18px" }}
        >
          {isMacOS && !showTitleBar ? (
            <div
              data-tauri-drag-region
              className="h-8 flex-shrink-0 flex items-start pt-3 pl-5"
            />
          ) : null}

          {/* 头部 Logo 区域 */}
          <div
            className="relative flex items-center overflow-hidden"
            style={{
              paddingBottom: "24px",
              paddingTop: isMacOS && !showTitleBar ? "16px" : "32px",
              paddingLeft: collapsed ? "15px" : "24px",
              gap: collapsed ? "0px" : "12px",
              transition: "all 0.5s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            {...(isMacOS &&
              !showTitleBar && {
                "data-tauri-drag-region": true,
              })}
          >
            <div className="flex-shrink-0 flex items-center justify-center">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md">
                <span className="text-primary-foreground font-bold text-sm">
                  CF
                </span>
              </div>
            </div>
            <div
              className="whitespace-nowrap"
              style={{
                opacity: collapsed ? 0 : 1,
                transform: collapsed ? "translateX(-10px)" : "translateX(0)",
                transition: "all 0.5s cubic-bezier(0.32, 0.72, 0, 1)",
              }}
            >
              <h1 className="text-lg font-bold text-foreground tracking-tight">
                ChmlFrp
              </h1>
              <p className="text-[10px] text-muted-foreground tracking-wide font-medium">
                LAUNCHER
              </p>
            </div>
          </div>

          <nav className="relative flex-1 px-3 py-2">
            <ul className="space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => handleMenuClick(item.id)}
                      className={cn(
                        "w-full flex items-center rounded-xl transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group relative overflow-hidden text-sm font-medium",
                        isActive
                          ? "bg-primary/10 text-primary shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                      )}
                      style={{
                        height: "42px",
                        paddingLeft: collapsed ? "12px" : "14px",
                        paddingRight: "14px",
                        paddingTop: "10px",
                        paddingBottom: "10px",
                        gap: collapsed ? "0px" : "12px",
                        justifyContent: "flex-start",
                      }}
                      title={collapsed ? item.label : undefined}
                    >
                      {isActive && (
                        <div
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-primary rounded-r-full transition-opacity duration-300"
                          style={{
                            opacity: collapsed ? 0 : 1,
                          }}
                        />
                      )}

                      <Icon
                        className={cn(
                          "w-[18px] h-[18px] transition-transform duration-200 flex-shrink-0",
                          isActive ? "text-primary" : "group-hover:scale-110",
                        )}
                      />

                      <span
                        className="tracking-tight whitespace-nowrap overflow-hidden"
                        style={{
                          opacity: collapsed ? 0 : 1,
                          transform: collapsed
                            ? "translateX(-10px)"
                            : "translateX(0)",
                          transition: "all 0.5s cubic-bezier(0.32, 0.72, 0, 1)",
                        }}
                      >
                        {item.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div
            className="relative border-t border-sidebar-border/30"
            style={{
              padding: collapsed ? "12px 0" : "16px", // p-4 = 16px
              transition: "all 0.5s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            ref={userMenuRef}
          >
            <button
              className="w-full text-left hover:bg-muted/50 flex items-center rounded-xl group relative overflow-hidden"
              style={{
                height: "56px",
                padding: "8px",
                paddingLeft: collapsed ? "13px" : "8px", // Center 40px in 66px vs Standard padding
                gap: collapsed ? "0px" : "12px",
                justifyContent: "flex-start",
                transition: "all 0.5s cubic-bezier(0.32, 0.72, 0, 1)",
              }}
              onClick={() => {
                if (user) {
                  if (mode !== "classic") {
                    if (userMenuOpen) {
                      setCollapsedState(true);
                    } else if (collapsed) {
                      setCollapsedState(false);
                    }
                  }
                  setUserMenuOpen((v) => !v);
                } else {
                  setError("");
                  setLoginOpen(true);
                }
              }}
            >
              <div className="flex-shrink-0 flex items-center justify-center">
                {user?.userimg ? (
                  <img
                    src={user.userimg}
                    alt={user.username}
                    className="h-10 w-10 rounded-xl object-cover ring-2 ring-primary/10 group-hover:ring-primary/20 transition-all"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-muted to-muted/80 flex items-center justify-center shadow-sm group-hover:shadow transition-shadow">
                    <LogIn className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div
                className="overflow-hidden whitespace-nowrap"
                style={{
                  opacity: collapsed ? 0 : 1,
                  transform: collapsed ? "translateX(-10px)" : "translateX(0)",
                  transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              >
                <h1 className="text-sm font-semibold text-foreground truncate">
                  {user?.username ?? "未登录"}
                </h1>
                <p className="text-[11px] text-muted-foreground truncate">
                  {user?.usergroup ?? "点击登录"}
                </p>
              </div>
            </button>

            {user && userMenuOpen && (
              <div
                className={cn(
                  "absolute left-3 right-3 bottom-full mb-2 rounded-2xl border border-border/40 shadow-2xl z-[100] overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 bg-card",
                  isFrosted && "backdrop-blur-md",
                )}
              >
                <div className="px-4 py-3 bg-foreground/[0.02] border-b border-border/30">
                  <div className="flex items-center gap-3">
                    {user.userimg ? (
                      <img
                        src={user.userimg}
                        alt={user.username}
                        className="h-10 w-10 rounded-lg object-cover ring-2 ring-foreground/10"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-foreground/90 to-foreground/70 flex items-center justify-center shadow-sm">
                        <User className="w-5 h-5 text-background" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-foreground truncate">
                        {user.username}
                      </h3>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {user.usergroup}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-1.5">
                  <button
                    className="w-full text-left text-sm text-foreground px-3 py-2.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-all duration-200 flex items-center gap-2.5 group"
                    onClick={() => {
                      onUserChange(null);
                      setUserMenuOpen(false);
                      clearStoredUser();
                      onTabChange("home");
                      if (mode !== "classic") {
                        setCollapsedState(true);
                      }
                    }}
                  >
                    <LogOut className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    <span className="font-medium">退出登录</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {LoginDialog}
    </>
  );
}
