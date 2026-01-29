import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  fetchNodeInfo,
  updateTunnel,
  getStoredUser,
  type Tunnel,
  type Node,
  type NodeInfo,
} from "@/services/api";
import { NodeSelector } from "./shared/NodeSelector";
import { NodeDetails } from "./shared/NodeDetails";
import { TunnelForm, type TunnelFormData } from "./shared/TunnelForm";

interface EditTunnelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  tunnel: Tunnel | null;
  preloadedNodes: Node[] | null;
}

export function EditTunnelDialog({
  open,
  onOpenChange,
  onSuccess,
  tunnel,
  preloadedNodes,
}: EditTunnelDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3>(3); // 编辑隧道默认从步骤3开始
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);
  const [loadingNodeInfo, setLoadingNodeInfo] = useState(false);
  const [pingLatency, setPingLatency] = useState<number | null>(null);
  const [pinging, setPinging] = useState(false);
  const [pingError, setPingError] = useState(false);

  // 表单数据
  const [formData, setFormData] = useState<TunnelFormData>({
    tunnelName: "",
    localIp: "127.0.0.1",
    portType: "TCP",
    localPort: "",
    remotePort: "",
    domain: "",
    encryption: false,
    compression: false,
    extraParams: "",
  });

  // 使用预加载的节点数据
  const nodes = preloadedNodes || [];

  // 当隧道数据变化时，初始化表单
  useEffect(() => {
    if (open && tunnel) {
      const isHttpProtocol =
        tunnel.type.toUpperCase() === "HTTP" ||
        tunnel.type.toUpperCase() === "HTTPS";

      setFormData({
        tunnelName: tunnel.name,
        localIp: tunnel.localip,
        portType: tunnel.type.toUpperCase(),
        localPort: tunnel.nport.toString(),
        remotePort: isHttpProtocol ? "" : tunnel.dorp,
        domain: isHttpProtocol ? tunnel.dorp : "",
        encryption: false,
        compression: false,
        extraParams: "",
      });

      // 加载当前节点信息用于显示 CNAME 提示
      loadNodeInfoForStep3(tunnel.node);
    }
  }, [open, tunnel]);

  const loadNodeInfo = async (nodeName: string) => {
    try {
      setLoadingNodeInfo(true);
      const data = await fetchNodeInfo(nodeName);
      setNodeInfo(data);
      setStep(2);
      performPing(data.ip);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "获取节点信息失败";
      toast.error(message);
    } finally {
      setLoadingNodeInfo(false);
    }
  };

  // 为步骤3加载节点信息（不执行ping，不改变step）
  const loadNodeInfoForStep3 = async (nodeName: string) => {
    try {
      const data = await fetchNodeInfo(nodeName);
      setNodeInfo(data);
    } catch (error) {
      console.error("Failed to load node info for step 3:", error);
    }
  };

  const performPing = async (host: string) => {
    try {
      setPinging(true);
      setPingLatency(null);
      setPingError(false);

      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{
        success: boolean;
        latency?: number;
        error?: string;
      }>("ping_host", { host });

      if (result.success && result.latency !== undefined) {
        setPingLatency(result.latency);
        setPingError(false);
      } else {
        setPingError(true);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes("Cannot find module")) {
        setPingError(true);
      }
    } finally {
      setPinging(false);
    }
  };

  // 进入第三步（填写隧道信息）
  const goToStep3 = () => {
    setStep(3);
  };

  const handleNodeSelect = (node: Node) => {
    const user = getStoredUser();
    const isFreeUser = user?.usergroup === "免费用户";

    if (isFreeUser && node.nodegroup === "vip") {
      toast.error("此节点为会员节点，您的权限不足");
      return;
    }

    setSelectedNode(node);
    loadNodeInfo(node.name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tunnel) {
      toast.error("隧道信息不存在");
      return;
    }

    // 如果没有选择新节点，使用原节点
    const targetNode = selectedNode?.name || tunnel.node;

    if (!formData.tunnelName.trim()) {
      toast.error("请输入隧道名称");
      return;
    }

    if (!formData.localPort) {
      toast.error("请输入本地端口");
      return;
    }

    const isHttpProtocol =
      formData.portType === "HTTP" || formData.portType === "HTTPS";

    if (isHttpProtocol) {
      if (!formData.domain.trim()) {
        toast.error("请输入域名");
        return;
      }
    } else {
      if (!formData.remotePort) {
        toast.error("请输入远程端口");
        return;
      }
    }

    try {
      setLoading(true);

      const baseTunnelParams = {
        tunnelid: tunnel.id,
        tunnelname: formData.tunnelName,
        node: targetNode,
        localip: formData.localIp,
        porttype: formData.portType,
        localport: parseInt(formData.localPort, 10),
        encryption: formData.encryption,
        compression: formData.compression,
        extraparams: formData.extraParams,
      };

      const tunnelParams = isHttpProtocol
        ? { ...baseTunnelParams, banddomain: formData.domain }
        : {
            ...baseTunnelParams,
            remoteport: parseInt(formData.remotePort, 10),
          };

      await updateTunnel(tunnelParams);

      toast.success("隧道更新成功");
      onSuccess();
      handleClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "更新隧道失败";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep(3); // 重置为步骤3
    setSelectedNode(null);
    setNodeInfo(null);
    setPingLatency(null);
    setPinging(false);
    setPingError(false);
    setFormData({
      tunnelName: "",
      localIp: "127.0.0.1",
      portType: "TCP",
      localPort: "",
      remotePort: "",
      domain: "",
      encryption: false,
      compression: false,
      extraParams: "",
    });
    onOpenChange(false);
  };

  const handleBack = () => {
    if (step === 3) {
      // 如果有选择的新节点，返回到步骤2；否则关闭对话框
      if (selectedNode) {
        setStep(2);
      } else {
        handleClose();
      }
    } else if (step === 2) {
      setStep(1);
      setNodeInfo(null);
      setPingLatency(null);
      setPinging(false);
      setPingError(false);
    }
  };

  // 切换到选择节点模式
  const switchToNodeSelection = () => {
    setStep(1);
  };

  const handleFormChange = useCallback((updates: Partial<TunnelFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          "max-h-[90vh] flex flex-col",
          step === 1 ? "max-w-6xl" : step === 2 ? "max-w-4xl" : "max-w-xl",
        )}
      >
        <DialogHeader className="shrink-0 gap-1.5">
          <DialogTitle
            className="text-xl animate-in fade-in duration-300"
            key={`title-${step}`}
          >
            {step === 1 && "编辑隧道"}
            {step === 2 && "节点详情"}
            {step === 3 && "修改配置"}
          </DialogTitle>
          {step === 1 && (
            <DialogDescription
              className="text-sm animate-in fade-in duration-300"
              key="desc-step1"
            >
              选择新的节点或直接编辑隧道配置
            </DialogDescription>
          )}
          {step === 2 && selectedNode && (
            <DialogDescription
              className="text-sm animate-in fade-in duration-300"
              key="desc-step2"
            >
              {selectedNode.name} - 查看节点详细信息
            </DialogDescription>
          )}
          {step === 3 && tunnel && (
            <DialogDescription
              className="text-sm animate-in fade-in duration-300"
              key="desc-step3"
            >
              节点：{selectedNode?.name || tunnel.node} - 修改隧道配置信息
            </DialogDescription>
          )}
        </DialogHeader>

        {step === 1 ? (
          // 第一步：选择节点或跳过
          <div
            key="step1"
            className="flex-1 flex flex-col min-h-0 py-4 animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <NodeSelector
              nodes={nodes}
              loading={loadingNodeInfo}
              onNodeSelect={handleNodeSelect}
            />
          </div>
        ) : step === 2 ? (
          // 第二步：查看节点详情
          <div
            key="step2"
            className="flex-1 flex flex-col min-h-0 pt-3 animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <NodeDetails
              nodeInfo={nodeInfo}
              pingLatency={pingLatency}
              pinging={pinging}
              pingError={pingError}
            />

            <DialogFooter className="shrink-0 pt-3 border-t gap-2">
              <Button type="button" variant="outline" onClick={handleBack}>
                返回
              </Button>
              <Button type="button" onClick={goToStep3}>
                下一步
              </Button>
            </DialogFooter>
          </div>
        ) : (
          // 第三步：填写隧道信息
          <form
            key="step3"
            onSubmit={handleSubmit}
            className="flex-1 flex flex-col min-h-0 pt-3 animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <TunnelForm
              formData={formData}
              onChange={handleFormChange}
              nodeInfo={nodeInfo}
              disabled={loading}
            />

            <DialogFooter className="shrink-0 pt-3 border-t gap-2">
              {!selectedNode && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={switchToNodeSelection}
                  disabled={loading}
                >
                  切换节点
                </Button>
              )}
              {selectedNode && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={loading}
                >
                  返回
                </Button>
              )}
              <Button
                type="submit"
                disabled={loading}
                className="min-w-[100px]"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
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
                    更新中
                  </span>
                ) : (
                  "保存修改"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
