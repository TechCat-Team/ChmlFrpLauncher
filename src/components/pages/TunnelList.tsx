import { useState, useEffect } from "react"
import { ScrollArea } from "../ui/scroll-area"
import { fetchTunnels, type Tunnel } from "../../services/api"

export function TunnelList() {
  const [tunnels, setTunnels] = useState<Tunnel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadTunnels = async () => {
    setLoading(true)
    setError("")
    try {
      const data = await fetchTunnels()
      setTunnels(data)
    } catch (err) {
      setTunnels([])
      const message = err instanceof Error ? err.message : "获取隧道列表失败"
      setError(message)
      console.error("获取隧道列表错误:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTunnels()
  }, [])

  const handleToggle = (tunnel: Tunnel, enabled: boolean) => {
    console.log(`${enabled ? "启动" : "停止"}隧道: ${tunnel.name}`)
    // TODO: 调用启动/停止 API
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

