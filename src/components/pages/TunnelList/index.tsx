import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
  EmptyContent,
} from "@/components/ui/empty";
import { Network } from "lucide-react";
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

  const apiTunnels = useMemo(
    () => tunnels.filter((t) => t.type === "api").map((t) => t.data),
    [tunnels],
  );

  const clearStartingTunnelRef = useRef<((tunnelKey: string) => void) | null>(null);

  const handleTunnelStartSuccess = useCallback((tunnelKey: string) => {
    clearStartingTunnelRef.current?.(tunnelKey);
  }, []);

  const handleTunnelStartError = useCallback((tunnelKey: string) => {
    clearStartingTunnelRef.current?.(tunnelKey);
  }, []);

  const { tunnelProgress, setTunnelProgress, timeoutRefs, successTimeoutRefs } =
    useTunnelProgress(
      apiTunnels,
      runningTunnels,
      setRunningTunnels,
      handleTunnelStartSuccess,
      handleTunnelStartError,
    );

  const { togglingTunnels, handleToggle, clearStartingTunnel } = useTunnelToggle({
    setTunnelProgress,
    setRunningTunnels,
    timeoutRefs,
    successTimeoutRefs,
  });

  useEffect(() => {
    clearStartingTunnelRef.current = clearStartingTunnel;
  }, [clearStartingTunnel]);

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
      ) : tunnels.length === 0 ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Network className="size-6" />
            </EmptyMedia>
            <EmptyTitle>暂无隧道</EmptyTitle>
            <EmptyDescription>
              您还没有创建任何隧道，点击下方按钮开始创建您的第一个隧道。
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
            >
              新建隧道
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ScrollArea className="flex-1 min-h-0 pr-1">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {tunnels.map((tunnel) => {
              const tunnelKey =
                tunnel.type === "api"
                  ? `api_${tunnel.data.id}`
                  : `custom_${tunnel.data.id}`;
              const isRunning = runningTunnels.has(tunnelKey);
              const isToggling = togglingTunnels.has(tunnelKey);
              const progress =
                tunnel.type === "api"
                  ? tunnelProgress.get(tunnelKey)
                  : undefined;
              return (
                <TunnelCard
                  key={tunnelKey}
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
