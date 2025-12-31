import { useState } from "react"
import { Sidebar } from "./components/Sidebar"
import { TunnelList } from "./components/pages/TunnelList"
import { Logs } from "./components/pages/Logs"
import { Settings } from "./components/pages/Settings"

function App() {
  const [activeTab, setActiveTab] = useState("tunnels")

  const renderContent = () => {
    switch (activeTab) {
      case "tunnels":
        return <TunnelList />
      case "logs":
        return <Logs />
      case "settings":
        return <Settings />
      default:
        return <TunnelList />
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

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
