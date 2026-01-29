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
import { toast } from "sonner";
import { useTunnelList } from "./hooks/useTunnelList";
import { useTunnelProgress } from "./hooks/useTunnelProgress";
import { useTunnelToggle } from "./hooks/useTunnelToggle";
import { useAutoStartTunnels } from "./hooks/useAutoStartTunnels";
import { TunnelCard } from "./components/TunnelCard";
import { CreateTunnelDialog } from "./components/CreateTunnelDialog";
import { EditTunnelDialog } from "./components/EditTunnelDialog";
import { EditCustomTunnelDialog } from "./components/EditCustomTunnelDialog";
import { CustomTunnelDialog } from "./components/CustomTunnelDialog";
import {
  fetchNodes,
  type Tunnel,
  type Node,
  type StoredUser,
} from "@/services/api";
import type { CustomTunnel } from "@/services/customTunnelService";
import type { UnifiedTunnel } from "./types";

interface TunnelListProps {
  user: StoredUser | null;
}

export function TunnelList({ user }: TunnelListProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [loadingCreateDialog, setLoadingCreateDialog] = useState(false);
  const [preloadedNodes, setPreloadedNodes] = useState<Node[] | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [, setLoadingEditDialog] = useState(false);
  const [preloadedEditNodes, setPreloadedEditNodes] = useState<Node[] | null>(
    null,
  );
  const [editingTunnel, setEditingTunnel] = useState<Tunnel | null>(null);
  const [editCustomDialogOpen, setEditCustomDialogOpen] = useState(false);
  const [editingCustomTunnel, setEditingCustomTunnel] =
    useState<CustomTunnel | null>(null);
  const [createCustomDialogOpen, setCreateCustomDialogOpen] = useState(false);

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

  const clearStartingTunnelRef = useRef<((tunnelKey: string) => void) | null>(
    null,
  );

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

  const { togglingTunnels, handleToggle, clearStartingTunnel } =
    useTunnelToggle({
      setTunnelProgress,
      setRunningTunnels,
      timeoutRefs,
      successTimeoutRefs,
    });

  useEffect(() => {
    clearStartingTunnelRef.current = clearStartingTunnel;
  }, [clearStartingTunnel]);

  // 自动启动隧道
  useAutoStartTunnels({
    tunnels,
    loading,
    runningTunnels,
    onToggle: handleToggle,
  });

  // 预加载节点数据并打开创建对话框
  const handleOpenCreateDialog = useCallback(async () => {
    // 未登录时，直接打开自定义隧道对话框
    if (!user) {
      setCreateCustomDialogOpen(true);
      return;
    }

    // 已登录时，获取节点列表并打开标准创建对话框
    try {
      setLoadingCreateDialog(true);
      const nodes = await fetchNodes();
      setPreloadedNodes(nodes);
      setCreateDialogOpen(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "获取节点列表失败";
      toast.error(message);
    } finally {
      setLoadingCreateDialog(false);
    }
  }, [user]);

  // 预加载节点数据并打开编辑对话框
  const handleOpenEditDialog = useCallback(async (tunnel: Tunnel) => {
    try {
      setLoadingEditDialog(true);
      const nodes = await fetchNodes();
      setPreloadedEditNodes(nodes);
      setEditingTunnel(tunnel);
      setEditDialogOpen(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "获取节点列表失败";
      toast.error(message);
    } finally {
      setLoadingEditDialog(false);
    }
  }, []);

  const handleEdit = useCallback(
    (tunnel: UnifiedTunnel) => {
      if (tunnel.type === "api") {
        handleOpenEditDialog(tunnel.data);
      } else if (tunnel.type === "custom") {
        setEditingCustomTunnel(tunnel.data);
        setEditCustomDialogOpen(true);
      }
    },
    [handleOpenEditDialog],
  );

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
          onClick={handleOpenCreateDialog}
          disabled={loadingCreateDialog}
          className="h-8 px-3 text-xs"
        >
          {loadingCreateDialog ? (
            <>
              <svg
                className="animate-spin h-3.5 w-3.5 mr-1.5"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              加载中...
            </>
          ) : (
            "新建隧道"
          )}
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
              onClick={handleOpenCreateDialog}
              disabled={loadingCreateDialog}
            >
              {loadingCreateDialog ? (
                <>
                  <svg
                    className="animate-spin h-3.5 w-3.5 mr-1.5"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  加载中...
                </>
              ) : (
                "新建隧道"
              )}
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
                  onEdit={handleEdit}
                />
              );
            })}
          </div>
        </ScrollArea>
      )}

      <CreateTunnelDialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) {
            setPreloadedNodes(null);
          }
        }}
        onSuccess={refreshTunnels}
        preloadedNodes={preloadedNodes}
        user={user}
      />

      <EditTunnelDialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setPreloadedEditNodes(null);
          }
        }}
        onSuccess={refreshTunnels}
        tunnel={editingTunnel}
        preloadedNodes={preloadedEditNodes}
      />

      <EditCustomTunnelDialog
        open={editCustomDialogOpen}
        onOpenChange={setEditCustomDialogOpen}
        onSuccess={refreshTunnels}
        tunnel={editingCustomTunnel}
      />

      <CustomTunnelDialog
        open={createCustomDialogOpen}
        onOpenChange={setCreateCustomDialogOpen}
        onSuccess={refreshTunnels}
      />
    </div>
  );
}
