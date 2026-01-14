import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Home as HomeIcon,
  List,
  ScrollText,
  Settings as SettingsIcon,
  X,
  LogIn,
  LogOut,
  User,
} from "lucide-react";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import {
  clearStoredUser,
  login,
  saveStoredUser,
  type StoredUser,
} from "@/services/api";
import { openUrl } from '@tauri-apps/plugin-opener';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  user: StoredUser | null;
  onUserChange: (user: StoredUser | null) => void;
}

export function Sidebar({
  activeTab,
  onTabChange,
  user,
  onUserChange,
}: SidebarProps) {
  const [showTitleBar, setShowTitleBar] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("showTitleBar");
    // 如果从未设置过，默认返回 false（关闭）
    if (stored === null) return false;
    return stored === "true";
  });

  useEffect(() => {
    const handleTitleBarVisibilityChange = () => {
      const stored = localStorage.getItem("showTitleBar");
      setShowTitleBar(stored !== "false");
    };

    window.addEventListener("titleBarVisibilityChanged", handleTitleBarVisibilityChange);
    return () => {
      window.removeEventListener("titleBarVisibilityChanged", handleTitleBarVisibilityChange);
    };
  }, []);
  const [loginOpen, setLoginOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const authedUser = await login(username, password);
      onUserChange(authedUser);
      if (rememberMe) {
        saveStoredUser(authedUser);
      }
      setLoginOpen(false);
      setUserMenuOpen(false);
      setPassword("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  const menuItems = [
    { id: "home", label: "首页", icon: HomeIcon },
    { id: "tunnels", label: "隧道", icon: List },
    { id: "logs", label: "日志", icon: ScrollText },
    { id: "settings", label: "设置", icon: SettingsIcon },
  ];

  const handleMenuClick = (itemId: string) => {
    if (itemId === "tunnels" && !user) {
      setLoginOpen(true);
      setError("请先登录后访问隧道页面");
      return;
    }

    setError("");
    onTabChange(itemId);
  };

  const isMacOS = typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  return (
    <div className="relative w-60 border-r border-sidebar-border/40 bg-sidebar overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-foreground/[0.02] via-transparent to-foreground/[0.01] pointer-events-none" />

      <div className="relative flex flex-col h-full">
        {isMacOS && !showTitleBar ? (
          <div
            data-tauri-drag-region
            className="h-8 flex-shrink-0 flex items-start pt-3 pl-5"
          />
        ) : null}
        <div 
          className={cn("px-5 pb-5", isMacOS && !showTitleBar ? "pt-4" : "pt-6")}
          {...(isMacOS && !showTitleBar && { "data-tauri-drag-region": true })}
        >
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-foreground to-foreground/80 flex items-center justify-center shadow-sm">
              <span className="text-background font-bold text-sm">CF</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground tracking-tight">
                ChmlFrp
              </h1>
              <p className="text-[10px] text-foreground/50 tracking-wide">
                LAUNCHER
              </p>
            </div>
          </div>
        </div>

        {/* 导航菜单 */}
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
                      "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-200 text-sm group",
                      isActive
                        ? "bg-foreground/[0.08] text-foreground border border-foreground/10"
                        : "text-foreground/65 hover:text-foreground hover:bg-foreground/[0.04]",
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon
                      className={cn(
                        "w-[18px] h-[18px] transition-transform duration-200",
                        isActive ? "" : "group-hover:scale-110",
                      )}
                    />
                    <span className="font-medium tracking-tight">
                      {item.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* 用户信息区域 */}
        <div className="relative border-t border-sidebar-border/30 p-3">
          <button
            className="w-full px-3 py-3 text-left hover:bg-foreground/[0.04] transition-all duration-200 flex items-center gap-3 rounded-xl group"
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
                className="h-10 w-10 rounded-xl object-cover ring-2 ring-foreground/10"
              />
            ) : (
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-foreground/90 to-foreground/70 flex items-center justify-center shadow-sm group-hover:shadow transition-shadow">
                <LogIn className="w-5 h-5 text-background" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-semibold text-sidebar-foreground truncate">
                {user?.username ?? "未登录"}
              </h1>
              <p className="text-[11px] text-sidebar-foreground/50 truncate">
                {user?.usergroup ?? "点击登录"}
              </p>
            </div>
          </button>

          {user && userMenuOpen && (
            <div className="absolute left-3 right-3 bottom-full mb-2 rounded-2xl border border-border/40 bg-card/98 backdrop-blur-md shadow-2xl z-10 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
              {/* 用户信息卡片 */}
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

              {/* 菜单选项 */}
              <div className="p-1.5">
                <button
                  className="w-full text-left text-sm text-foreground px-3 py-2.5 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-all duration-200 flex items-center gap-2.5 group"
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

        <Dialog
          open={loginOpen}
          onOpenChange={(open) => {
            setLoginOpen(open);
            if (!open) {
              setError("");
            }
          }}
        >
          <DialogPortal>
            <DialogOverlay className="z-[9999] backdrop-blur-sm" />
            <DialogPrimitive.Content
              className="fixed top-[50%] left-[50%] z-[10000] w-full max-w-md translate-x-[-50%] translate-y-[-50%] rounded-2xl bg-card/95 backdrop-blur-md border border-border/50 p-8 shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:slide-in-from-bottom-4 duration-300"
            >
              {/* 头部 */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-foreground to-foreground/80 flex items-center justify-center shadow-sm">
                    <LogIn className="w-5 h-5 text-background" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">
                      登录账号
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      登录以访问所有功能
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-all duration-200 flex items-center justify-center"
                  onClick={() => setLoginOpen(false)}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 表单 */}
              <form className="space-y-4" onSubmit={handleLogin}>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground/80 tracking-wide">
                    账户名
                  </label>
                  <input
                    className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/50 transition-all duration-200"
                    placeholder="请输入账户名"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground/80 tracking-wide">
                    密码
                  </label>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-border/50 bg-background/50 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground/50 transition-all duration-200"
                    placeholder="请输入密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="rememberMe"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-border/50 text-foreground focus:ring-2 focus:ring-foreground/20 cursor-pointer"
                  />
                  <label
                    htmlFor="rememberMe"
                    className="text-xs text-foreground/80 cursor-pointer select-none"
                  >
                    保存登录（重启后无需重新登录）
                  </label>
                </div>

                {error && (
                  <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 animate-in fade-in slide-in-from-top-1 duration-200">
                    <p className="text-xs text-destructive font-medium">
                      {error}
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-foreground text-background py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md active:scale-[0.98] mt-6"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                      登录中...
                    </span>
                  ) : (
                    "立即登录"
                  )}
                </button>
              </form>

              {/* 底部提示 */}
              <div className="mt-6 pt-4 border-t border-border/30">
                <p className="text-xs text-center text-muted-foreground">
                  还没有账号？{" "}
                  <button
                    onClick={() => openUrl("https://www.chmlfrp.net")}
                    className="text-foreground font-medium hover:underline"
                  >
                    立即注册
                  </button>
                </p>
              </div>
            </DialogPrimitive.Content>
          </DialogPortal>
        </Dialog>
      </div>
    </div>
  );
}
