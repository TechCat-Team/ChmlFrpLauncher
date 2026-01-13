import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useTunnelList } from "./hooks/useTunnelList";
import { useTunnelProgress } from "./hooks/useTunnelProgress";
import { useTunnelToggle } from "./hooks/useTunnelToggle";
import { TunnelCard } from "./components/TunnelCard";
import { CreateTunnelDialog } from "./components/CreateTunnelDialog";

export function TunnelList() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const {
    tunnels,
    loading,
    error,
    runningTunnels,
    setRunningTunnels,
    refreshTunnels,
  } = useTunnelList();

  const {
    tunnelProgress,
    setTunnelProgress,
    timeoutRefs,
    successTimeoutRefs,
  } = useTunnelProgress(tunnels, runningTunnels, setRunningTunnels);

  const { togglingTunnels, handleToggle } = useTunnelToggle({
    setTunnelProgress,
    setRunningTunnels,
    timeoutRefs,
    successTimeoutRefs,
  });

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-medium text-foreground">隧道</h1>
          {!loading && !error && (
            <span className="text-xs text-muted-foreground">
              {tunnels.length} 个
            </span>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => setCreateDialogOpen(true)}
          className="h-8 px-3 text-xs"
        >
          新建隧道
        </Button>
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
              const isRunning = runningTunnels.has(tunnel.id);
              const isToggling = togglingTunnels.has(tunnel.id);
              const progress = tunnelProgress.get(tunnel.id);
              return (
                <TunnelCard
                  key={tunnel.id}
                  tunnel={tunnel}
                  isRunning={isRunning}
                  isToggling={isToggling}
                  progress={progress}
                  onToggle={handleToggle}
                  onRefresh={refreshTunnels}
                />
              );
            })}
          </div>
        </ScrollArea>
      )}

      <CreateTunnelDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={refreshTunnels}
      />
    </div>
  );
}

