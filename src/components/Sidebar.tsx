import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { List, ScrollText, Settings as SettingsIcon } from "lucide-react"

interface SidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const [loginOpen, setLoginOpen] = useState(false)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [userInfo, setUserInfo] = useState<{ username: string; usergroup: string; userimg?: string | null; usertoken?: string } | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  // 初始化从本地读取登录信息
  useEffect(() => {
    const saved = localStorage.getItem("chmlfrp_user")
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setUserInfo(parsed)
      } catch {
        localStorage.removeItem("chmlfrp_user")
      }
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const res = await fetch("https://cf-v2.uapis.cn/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (data?.code === 200) {
        setUserInfo({
          username: data.data?.username ?? username,
          usergroup: data.data?.usergroup ?? "",
          userimg: data.data?.userimg ?? "",
          usertoken: data.data?.usertoken ?? "",
        })
        localStorage.setItem(
          "chmlfrp_user",
          JSON.stringify({
            username: data.data?.username ?? username,
            usergroup: data.data?.usergroup ?? "",
            userimg: data.data?.userimg ?? "",
            usertoken: data.data?.usertoken ?? "",
          })
        )
        setLoginOpen(false)
        setUserMenuOpen(false)
        setPassword("")
      } else {
        setError(data?.msg || "登录失败")
      }
    } catch {
      setError("网络异常，请稍后再试")
    } finally {
      setLoading(false)
    }
  }

  const menuItems = [
    { id: "tunnels", label: "隧道", icon: List },
    { id: "logs", label: "日志", icon: ScrollText },
    { id: "settings", label: "设置", icon: SettingsIcon },
  ]

  return (
    <div className="w-48 border-r border-sidebar-border bg-sidebar flex flex-col">
      <div className="relative border-b border-sidebar-border">
        <button
          className="w-full p-4 text-left hover:bg-foreground/[0.02] transition-colors flex items-center gap-2.5"
          onClick={() => {
            if (userInfo) {
              setUserMenuOpen((v) => !v)
            } else {
              setLoginOpen(true)
            }
          }}
        >
          {userInfo?.userimg ? (
            <img
              src={userInfo.userimg}
              alt={userInfo.username}
              className="h-8 w-8 rounded-lg object-cover"
            />
          ) : (
            <div className="h-8 w-8 rounded-lg bg-foreground text-background flex items-center justify-center text-xs font-bold">
              CF
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-sm font-semibold text-sidebar-foreground">
              {userInfo?.username ?? "ChmlFrp"}
            </h1>
            <p className="text-[11px] text-sidebar-foreground/50">
              {userInfo?.usergroup ?? "点击登录"}
            </p>
          </div>
        </button>

        {userInfo && userMenuOpen && (
          <div className="absolute left-3 right-3 top-full mt-2 rounded-md border border-border/80 bg-card shadow-lg z-10">
            <button
              className="w-full text-left text-xs text-foreground px-3 py-2 hover:bg-foreground/[0.04] transition-colors rounded-md"
              onClick={() => {
                setUserInfo(null)
                setUserMenuOpen(false)
                localStorage.removeItem("chmlfrp_user")
              }}
            >
              退出登录
            </button>
          </div>
        )}
      </div>

      <nav className="flex-1 p-3">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <li key={item.id}>
                <button
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded transition-colors text-sm",
                    isActive
                      ? "bg-foreground/5 text-foreground"
                      : "text-foreground/60 hover:text-foreground hover:bg-foreground/[0.02]"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-medium">{item.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {loginOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-card border border-border/80 p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-foreground">登录</h2>
              <button
                className="text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setLoginOpen(false)}
              >
                关闭
              </button>
            </div>
            <form className="space-y-3" onSubmit={handleLogin}>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">账户名</label>
                <input
                  className="w-full rounded border border-border/80 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">密码</label>
                <input
                  type="password"
                  className="w-full rounded border border-border/80 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded bg-foreground text-background py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
              >
                {loading ? "登录中..." : "登录"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

