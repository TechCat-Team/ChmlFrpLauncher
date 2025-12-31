import { useState, useEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Tunnel {
  id: number
  name: string
  localip: string
  type: string
  nport: number
  dorp: string
  node: string
  ap: string
  uptime: string | null
  client_version: string | null
  today_traffic_in: number | null
  today_traffic_out: number | null
  cur_conns: number | null
  nodestate: string
  ip: string
}

export function TunnelList() {
  const [tunnels, setTunnels] = useState<Tunnel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const fetchTunnels = async () => {
    try {
      const stored = localStorage.getItem("chmlfrp_user")
      if (!stored) {
        setError("请先登录")
        setLoading(false)
        return
      }
      const user = JSON.parse(stored)
      const token = user?.usertoken

      if (!token) {
        setError("登录信息已过期，请重新登录")
        localStorage.removeItem("chmlfrp_user")
        setLoading(false)
        return
      }

      const res = await fetch("https://cf-v2.uapis.cn/tunnel", {
        headers: { authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data?.code === 200 && Array.isArray(data.data)) {
        setTunnels(data.data)
        setError("")
      } else {
        setError(data?.msg || "获取隧道列表失败")
      }
    } catch (err) {
      setError("网络异常")
      console.error("获取隧道列表错误:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTunnels()
  }, [])

  const handleToggle = (tunnel: Tunnel, enabled: boolean) => {
    console.log(`${enabled ? "启动" : "停止"}隧道: ${tunnel.name}`)
    // TODO: 调用启动/停止 API
  }

  const formatTraffic = (bytes: number | null) => {
    if (bytes == null) return "-"
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-medium text-foreground">隧道</h1>
        {!loading && !error && (
          <span className="text-xs text-muted-foreground">{tunnels.length} 个</span>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          加载中...
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          {error}
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0 pr-1">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {tunnels.map((tunnel) => {
              const isRunning = tunnel.uptime != null
              return (
                <div
                  key={tunnel.id}
                  className="border border-border/60 rounded-lg p-4 hover:border-foreground/20 transition-colors bg-card"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-foreground truncate">{tunnel.name}</h3>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground uppercase">
                          {tunnel.type}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{tunnel.node}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer ml-2">
                      <input
                        type="checkbox"
                        checked={isRunning}
                        onChange={(e) => handleToggle(tunnel, e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-foreground transition-colors"></div>
                      <div className="absolute left-[2px] top-[2px] w-4 h-4 bg-background rounded-full transition-transform peer-checked:translate-x-4"></div>
                    </label>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">本地地址</span>
                      <span className="font-mono">{tunnel.localip}:{tunnel.nport}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">链接地址</span>
                      <span className="font-mono">{tunnel.ip}:{tunnel.dorp}</span>
                    </div>
                    
                    {tunnel.nodestate && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">节点</span>
                        <span className={tunnel.nodestate === "online" ? "text-foreground" : "text-muted-foreground"}>
                          {tunnel.nodestate === "online" ? "在线" : "离线"}
                        </span>
                      </div>
                    )}

                    {(tunnel.today_traffic_in != null || tunnel.today_traffic_out != null) && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">今日流量</span>
                        <span className="font-mono">
                          ↓{formatTraffic(tunnel.today_traffic_in)} ↑{formatTraffic(tunnel.today_traffic_out)}
                        </span>
                      </div>
                    )}

                    {tunnel.cur_conns != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">连接数</span>
                        <span>{tunnel.cur_conns}</span>
                      </div>
                    )}

                    {tunnel.uptime && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">运行时间</span>
                        <span>{tunnel.uptime}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

