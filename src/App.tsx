import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { Sidebar } from "./components/Sidebar"
import { Home } from "./components/pages/Home"
import { TunnelList } from "./components/pages/TunnelList"
import { Logs } from "./components/pages/Logs"
import { Settings } from "./components/pages/Settings"
import { getStoredUser, type StoredUser } from "./services/api"
import { frpcDownloader } from "./services/frpcDownloader.ts"
import { Progress } from "./components/ui/progress"
import { logStore } from "./services/logStore"

let globalDownloadFlag = false

function App() {
  const [activeTab, setActiveTab] = useState("home")
  const [user, setUser] = useState<StoredUser | null>(() => getStoredUser())
  const downloadToastRef = useRef<string | number | null>(null)
  const isDownloadingRef = useRef(false)

  useEffect(() => {
    logStore.startListening()
  }, [])

  useEffect(() => {
    const checkAndDownloadFrpc = async () => {
      if (globalDownloadFlag || isDownloadingRef.current) {
        return
      }
      
      globalDownloadFlag = true
      isDownloadingRef.current = true

      try {
        const exists = await frpcDownloader.checkFrpcExists()
        
        if (exists) {
          globalDownloadFlag = false
          isDownloadingRef.current = false
          return
        }
        downloadToastRef.current = toast.loading(
          <div className="space-y-2">
            <div className="text-sm font-medium">正在下载 frpc 客户端...</div>
            <Progress value={0} />
            <div className="text-xs text-muted-foreground">0.0%</div>
          </div>,
          {
            duration: Infinity,
          }
        )

        await frpcDownloader.downloadFrpc((progress) => {
          if (downloadToastRef.current !== null) {
            toast.loading(
              <div className="space-y-2">
                <div className="text-sm font-medium">正在下载 frpc 客户端...</div>
                <Progress value={progress.percentage} />
                <div className="text-xs text-muted-foreground">
                  {progress.percentage.toFixed(1)}% ({(progress.downloaded / 1024 / 1024).toFixed(2)} MB / {(progress.total / 1024 / 1024).toFixed(2)} MB)
                </div>
              </div>,
              {
                id: downloadToastRef.current,
                duration: Infinity,
              }
            )
          }
        })

        if (downloadToastRef.current !== null) {
          toast.success("frpc 客户端下载成功", {
            id: downloadToastRef.current,
            duration: 3000,
          })
          downloadToastRef.current = null
        }
        globalDownloadFlag = false
        isDownloadingRef.current = false
      } catch (error) {
        
        if (downloadToastRef.current !== null) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          toast.error(
            <div className="space-y-2">
              <div className="text-sm font-medium">frpc 客户端下载失败</div>
              <div className="text-xs text-muted-foreground">{errorMsg}</div>
              <div className="text-xs">请前往设置页面重新下载</div>
            </div>,
            {
              id: downloadToastRef.current,
              duration: 10000,
            }
          )
          downloadToastRef.current = null
        }
        
        globalDownloadFlag = false
        isDownloadingRef.current = false
      }
    }

    checkAndDownloadFrpc()

    return () => {
      frpcDownloader.cleanup()
      if (downloadToastRef.current !== null) {
        toast.dismiss(downloadToastRef.current)
        downloadToastRef.current = null
      }
    }
  }, [])

  const handleTabChange = (tab: string) => {
    if (tab === "tunnels" && !user) return
    setActiveTab(tab)
  }

  const renderContent = () => {
    switch (activeTab) {
      case "home":
        return <Home onUserChange={setUser} />
      case "tunnels":
        return <TunnelList />
      case "logs":
        return <Logs />
      case "settings":
        return <Settings />
      default:
        return <Home onUserChange={setUser} />
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        user={user}
        onUserChange={setUser}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto p-6 md:p-8">
          <div className="max-w-6xl mx-auto w-full h-full">
            <div className="h-full flex flex-col">{renderContent()}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
