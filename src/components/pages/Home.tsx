import { useState } from "react"

interface HomeProps {
  onNavigate?: (tab: string) => void
}

interface UserInfo {
  username?: string
  usergroup?: string
  tunnelCount?: number
  tunnel?: number
}

export function Home({ onNavigate }: HomeProps) {
  const [userInfo] = useState<UserInfo | null>(() => {
    if (typeof window === "undefined") return null
    const saved = localStorage.getItem("chmlfrp_user")
    if (!saved) return null
    try {
      return JSON.parse(saved)
    } catch {
      return null
    }
  })

  const quickActions = [
    { id: "tunnels", title: "管理隧道", desc: "查看、启停隧道，了解运行状态" },
    { id: "logs", title: "查看日志", desc: "排查连接与节点问题，关注实时输出" },
    { id: "settings", title: "偏好设置", desc: "切换主题或调整常用选项" },
  ]

  const tips = [
    "左侧头像点击可登录或退出账号",
    "隧道列表会在进入页面时自动刷新",
    "日志页面将用于展示运行输出，便于排查问题",
  ]

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="border border-border/60 rounded-lg p-6 bg-card">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">ChmlFrp Launcher</p>
            <h1 className="text-2xl font-semibold text-foreground mt-1">
              欢迎回来{userInfo?.username ? `，${userInfo.username}` : ""}
            </h1>
          </div>
          {onNavigate && (
            <div className="flex flex-wrap gap-2">
              <button
                className="px-3 py-2 text-xs rounded bg-foreground text-background font-medium hover:opacity-90 transition-opacity"
              >
                签到
              </button>
              <button
                className="px-3 py-2 text-xs rounded border border-border/60 text-foreground hover:bg-foreground/[0.03] transition-colors"
              >
                签到信息
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-border/60 rounded-lg p-5 bg-card">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">账号状态</h2>
            <span
              className={`text-[11px] px-2 py-1 rounded ${
                userInfo
                  ? "bg-foreground text-background"
                  : "border border-border/60 text-muted-foreground"
              }`}
            >
              {userInfo ? "已登录" : "未登录"}
            </span>
          </div>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            {userInfo ? (
              <>
                <p className="text-foreground">你好，{userInfo.username}</p>
                <p>用户组：{userInfo.usergroup || "未分组"}</p>
                <p>隧道量：{userInfo.tunnel} / {userInfo.tunnelCount}</p>
              </>
            ) : (
              <p>点击左侧头像即可登录账号，登录后会在这里显示用户信息。</p>
            )}
          </div>
        </div>

        <div className="border border-border/60 rounded-lg p-5 bg-card md:col-span-2">
          <h2 className="text-sm font-semibold text-foreground mb-3">快速操作</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {quickActions.map((action) => (
              <div key={action.id} className="rounded-lg border border-border/60 p-3 bg-foreground/[0.015]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{action.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{action.desc}</p>
                  </div>
                  {onNavigate && (
                    <button
                      onClick={() => onNavigate(action.id)}
                      className="text-[11px] px-2 py-1 rounded border border-border/60 text-foreground hover:bg-foreground/[0.03] transition-colors"
                    >
                      前往
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-border/60 rounded-lg p-5 bg-card md:col-span-3">
          <h2 className="text-sm font-semibold text-foreground mb-3">使用提示</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {tips.map((tip, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-foreground/60"></span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}


