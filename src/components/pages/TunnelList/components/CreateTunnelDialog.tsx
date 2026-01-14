import { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  fetchNodes,
  fetchNodeInfo,
  createTunnel,
  getStoredUser,
  type Node,
  type NodeInfo,
} from "@/services/api";
import { CustomTunnelDialog } from "./CustomTunnelDialog";

interface CreateTunnelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// 格式化字节大小
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function CreateTunnelDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateTunnelDialogProps) {
  const [tunnelType, setTunnelType] = useState<"standard" | "custom">(
    "standard",
  );
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);
  const [loadingNodeInfo, setLoadingNodeInfo] = useState(false);
  const [pingLatency, setPingLatency] = useState<number | null>(null);
  const [pinging, setPinging] = useState(false);
  const [pingError, setPingError] = useState(false);

  // 表单字段
  const [tunnelName, setTunnelName] = useState("");
  const [localIp, setLocalIp] = useState("127.0.0.1");
  const [portType, setPortType] = useState("TCP");
  const [localPort, setLocalPort] = useState("");
  const [remotePort, setRemotePort] = useState("");
  const [domain, setDomain] = useState("");
  const [encryption, setEncryption] = useState(false);
  const [compression, setCompression] = useState(false);
  const [extraParams, setExtraParams] = useState("");

  // 加载节点列表
  useEffect(() => {
    if (open && step === 1) {
      loadNodes();
    }
  }, [open, step]);

  const loadNodes = async () => {
    try {
      const data = await fetchNodes();
      setNodes(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "获取节点列表失败";
      toast.error(message);
    }
  };

  // 生成随机隧道名称
  const generateRandomTunnelName = () => {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // 在端口范围内生成随机端口
  const generateRandomPort = (portRange: string) => {
    const match = portRange.match(/(\d+)-(\d+)/);
    if (match) {
      const min = parseInt(match[1], 10);
      const max = parseInt(match[2], 10);
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    const singlePort = parseInt(portRange, 10);
    return isNaN(singlePort) ? 10000 : singlePort;
  };

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
    if (nodeInfo) {
      // 生成随机隧道名称和远程端口
      setTunnelName(generateRandomTunnelName());
      setRemotePort(generateRandomPort(nodeInfo.rport).toString());
    }
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

    if (!selectedNode) {
      toast.error("请选择节点");
      return;
    }

    if (!tunnelName.trim()) {
      toast.error("请输入隧道名称");
      return;
    }

    if (!localPort) {
      toast.error("请输入本地端口");
      return;
    }

    const isHttpProtocol = portType === "HTTP" || portType === "HTTPS";

    if (isHttpProtocol) {
      if (!domain.trim()) {
        toast.error("请输入域名");
        return;
      }
    } else {
      if (!remotePort) {
        toast.error("请输入远程端口");
        return;
      }
    }

    try {
      setLoading(true);

      const baseTunnelParams = {
        tunnelname: tunnelName,
        node: selectedNode.name,
        localip: localIp,
        porttype: portType,
        localport: parseInt(localPort, 10),
        encryption,
        compression,
        extraparams: extraParams,
      };

      const tunnelParams = isHttpProtocol
        ? { ...baseTunnelParams, banddomain: domain }
        : { ...baseTunnelParams, remoteport: parseInt(remotePort, 10) };

      await createTunnel(tunnelParams);

      toast.success("隧道创建成功");
      onSuccess();
      handleClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "创建隧道失败";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTunnelType("standard");
    setStep(1);
    setSelectedNode(null);
    setNodeInfo(null);
    setPingLatency(null);
    setPinging(false);
    setPingError(false);
    setTunnelName("");
    setLocalIp("127.0.0.1");
    setPortType("TCP");
    setLocalPort("");
    setRemotePort("");
    setDomain("");
    setEncryption(false);
    setCompression(false);
    setExtraParams("");
    onOpenChange(false);
  };

  const handleBack = () => {
    if (step === 3) {
      setStep(2);
    } else if (step === 2) {
      setStep(1);
      setNodeInfo(null);
      setPingLatency(null);
      setPinging(false);
      setPingError(false);
    }
  };

  // 按节点组分组
  const vipNodes = nodes.filter((node) => node.nodegroup === "vip");
  const userNodes = nodes.filter((node) => node.nodegroup === "user");

  // 根据用户权限确定默认展开的 Accordion 项
  const user = getStoredUser();
  const isFreeUser = user?.usergroup === "免费用户";
  const defaultOpenValues = isFreeUser ? ["user"] : ["vip", "user"];

  // 如果是自定义隧道模式，显示自定义隧道对话框
  if (tunnelType === "custom") {
    return (
      <CustomTunnelDialog
        open={open}
        onOpenChange={handleClose}
        onSuccess={onSuccess}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          "max-h-[90vh] flex flex-col transition-all duration-500 ease-in-out",
          step === 1 ? "max-w-6xl" : step === 2 ? "max-w-4xl" : "max-w-xl",
        )}
      >
        <DialogHeader className="shrink-0 gap-1.5">
          <DialogTitle
            className="text-xl animate-in fade-in duration-300"
            key={`title-${step}`}
          >
            {step === 1 && "新建隧道"}
            {step === 2 && "节点详情"}
            {step === 3 && "配置隧道"}
          </DialogTitle>
          {step === 2 && selectedNode && (
            <DialogDescription
              className="text-sm animate-in fade-in duration-300"
              key="desc-step2"
            >
              {selectedNode.name} - 查看节点详细信息
            </DialogDescription>
          )}
          {step === 3 && selectedNode && (
            <DialogDescription
              className="text-sm animate-in fade-in duration-300"
              key="desc-step3"
            >
              节点：{selectedNode.name} - 填写隧道配置信息
            </DialogDescription>
          )}
        </DialogHeader>

        {step === 1 ? (
          // 第一步：选择隧道类型和节点
          <div
            key="step1"
            className="flex-1 flex flex-col min-h-0 py-4 animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <Tabs
              value={tunnelType}
              onValueChange={(value) =>
                setTunnelType(value as "standard" | "custom")
              }
              className="mb-4"
            >
              <TabsList className="w-full">
                <TabsTrigger value="standard" className="flex-1">
                  标准隧道
                </TabsTrigger>
                <TabsTrigger value="custom" className="flex-1">
                  自定义隧道
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex-1 min-h-0 overflow-y-auto pr-4">
              <Accordion
                type="multiple"
                defaultValue={defaultOpenValues}
                className="space-y-3"
              >
                {vipNodes.length > 0 && (
                  <AccordionItem value="vip" className="border-0">
                    <AccordionTrigger className="py-2 hover:no-underline">
                      <div className="flex items-center gap-3 w-full">
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-5 bg-gradient-to-b from-primary/80 to-primary rounded-full" />
                          <h3 className="text-sm font-semibold">会员节点</h3>
                        </div>
                        <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
                        <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                          {vipNodes.length} 个节点
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2">
                      <div className="grid grid-cols-3 gap-3">
                        {vipNodes.map((node) => (
                          <Tooltip key={node.id}>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => handleNodeSelect(node)}
                                disabled={loadingNodeInfo}
                                className="group relative px-3 pt-2.5 pb-3 border border-border/60 rounded-xl hover:border-primary hover:bg-accent/50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-br from-background to-muted/20"
                              >
                                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:to-transparent transition-all" />
                                <div className="relative space-y-1">
                                  <span className="block text-[10px] text-muted-foreground font-medium leading-tight">
                                    #{node.id}
                                  </span>
                                  <h4 className="font-semibold text-sm group-hover:text-primary transition-colors leading-snug">
                                    {node.name}
                                  </h4>
                                </div>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="max-w-[240px] text-pretty"
                            >
                              <div className="space-y-1">
                                {node.notes && (
                                  <p className="text-xs leading-snug">
                                    {node.notes}
                                  </p>
                                )}
                                <div className="flex gap-2 text-[10px] whitespace-nowrap">
                                  <span
                                    className={
                                      node.fangyu === "true"
                                        ? "opacity-100"
                                        : "opacity-40"
                                    }
                                  >
                                    {node.fangyu === "true" ? "✓" : "✗"} 防御
                                  </span>
                                  <span
                                    className={
                                      node.udp === "true"
                                        ? "opacity-100"
                                        : "opacity-40"
                                    }
                                  >
                                    {node.udp === "true" ? "✓" : "✗"} UDP
                                  </span>
                                  <span
                                    className={
                                      node.web === "yes"
                                        ? "opacity-100"
                                        : "opacity-40"
                                    }
                                  >
                                    {node.web === "yes" ? "✓" : "✗"} 建站
                                  </span>
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}

                {userNodes.length > 0 && (
                  <AccordionItem value="user" className="border-0">
                    <AccordionTrigger className="py-2 hover:no-underline">
                      <div className="flex items-center gap-3 w-full">
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-5 bg-gradient-to-b from-primary/60 to-primary/80 rounded-full" />
                          <h3 className="text-sm font-semibold">非会员节点</h3>
                        </div>
                        <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
                        <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                          {userNodes.length} 个节点
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2">
                      <div className="grid grid-cols-3 gap-3">
                        {userNodes.map((node) => (
                          <Tooltip key={node.id}>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => handleNodeSelect(node)}
                                disabled={loadingNodeInfo}
                                className="group relative px-3 pt-2.5 pb-3 border border-border/60 rounded-xl hover:border-primary hover:bg-accent/50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-br from-background to-muted/20"
                              >
                                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:to-transparent transition-all" />
                                <div className="relative space-y-1">
                                  <span className="block text-[10px] text-muted-foreground font-medium leading-tight">
                                    #{node.id}
                                  </span>
                                  <h4 className="font-semibold text-sm group-hover:text-primary transition-colors leading-snug">
                                    {node.name}
                                  </h4>
                                </div>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="max-w-[240px] text-pretty"
                            >
                              <div className="space-y-1">
                                {node.notes && (
                                  <p className="text-xs leading-snug">
                                    {node.notes}
                                  </p>
                                )}
                                <div className="flex gap-2 text-[10px] whitespace-nowrap">
                                  <span
                                    className={
                                      node.fangyu === "true"
                                        ? "opacity-100"
                                        : "opacity-40"
                                    }
                                  >
                                    {node.fangyu === "true" ? "✓" : "✗"} 防御
                                  </span>
                                  <span
                                    className={
                                      node.udp === "true"
                                        ? "opacity-100"
                                        : "opacity-40"
                                    }
                                  >
                                    {node.udp === "true" ? "✓" : "✗"} UDP
                                  </span>
                                  <span
                                    className={
                                      node.web === "yes"
                                        ? "opacity-100"
                                        : "opacity-40"
                                    }
                                  >
                                    {node.web === "yes" ? "✓" : "✗"} 建站
                                  </span>
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}

                {nodes.length === 0 && !loadingNodeInfo && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                      <svg
                        className="w-8 h-8 text-muted-foreground"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      没有找到符合条件的节点
                    </p>
                  </div>
                )}
              </Accordion>
            </div>

            {loadingNodeInfo && (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground shrink-0">
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
                <span>加载节点信息中...</span>
              </div>
            )}
          </div>
        ) : step === 2 ? (
          // 第二步：查看节点详情
          <div
            key="step2"
            className="flex-1 flex flex-col min-h-0 pt-3 animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            <div className="flex-1 min-h-0 overflow-y-auto pr-4">
              <div className="space-y-4 pb-3">
                {nodeInfo && (
                  <>
                    <div className="relative p-4 sm:p-6 bg-gradient-to-br from-muted/40 to-muted/20 rounded-xl border border-border/50 overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/5 to-transparent rounded-full blur-2xl" />

                      <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base sm:text-lg font-semibold">
                            {nodeInfo.name}
                          </h3>
                          <div className="flex items-center gap-2 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full bg-background/60 border border-border/40">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                nodeInfo.state === "online"
                                  ? "bg-emerald-500 animate-pulse"
                                  : "bg-red-500"
                              }`}
                            />
                            <span
                              className={`text-xs font-medium ${
                                nodeInfo.state === "online"
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-red-600 dark:text-red-400"
                              }`}
                            >
                              {nodeInfo.state === "online" ? "在线" : "离线"}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {pinging ? (
                            <div className="flex items-center gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-background/60 border border-border/40">
                              <svg
                                className="animate-spin h-3.5 w-3.5 text-muted-foreground"
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
                              <span className="text-xs text-muted-foreground">
                                测速中...
                              </span>
                            </div>
                          ) : pingLatency !== null ? (
                            <div className="flex items-center gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-background/60 border border-border/40">
                              <div
                                className={`w-2 h-2 rounded-full ${
                                  pingLatency < 50
                                    ? "bg-emerald-500"
                                    : pingLatency < 100
                                      ? "bg-yellow-500"
                                      : pingLatency < 200
                                        ? "bg-orange-500"
                                        : "bg-red-500"
                                }`}
                              />
                              <span className="text-xs font-medium font-mono">
                                {Math.round(pingLatency)}ms
                              </span>
                            </div>
                          ) : pingError ? (
                            <div className="flex items-center gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-background/60 border border-border/40">
                              <div className="w-2 h-2 rounded-full bg-gray-400" />
                              <span className="text-xs text-muted-foreground">
                                无法测速
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-3 sm:gap-y-3.5 text-sm">
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground min-w-[70px] sm:min-w-[90px] text-xs sm:text-sm">
                            地区
                          </span>
                          <span className="font-medium text-xs sm:text-sm">
                            {nodeInfo.area}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 sm:col-span-2">
                          <span className="text-muted-foreground min-w-[70px] sm:min-w-[90px] text-xs sm:text-sm">
                            节点地址
                          </span>
                          <span className="font-mono text-[10px] sm:text-xs font-medium break-all">
                            {nodeInfo.ip} - {nodeInfo.realIp}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 sm:col-span-2">
                          <span className="text-muted-foreground min-w-[70px] sm:min-w-[90px] text-xs sm:text-sm">
                            可用端口
                          </span>
                          <span className="font-mono text-[10px] sm:text-xs font-medium">
                            {nodeInfo.rport}
                          </span>
                        </div>

                        <div className="flex items-start sm:items-center gap-3 sm:col-span-2">
                          <span className="text-muted-foreground min-w-[70px] sm:min-w-[90px] text-xs sm:text-sm pt-0.5 sm:pt-0">
                            支持功能
                          </span>
                          <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                            <span
                              className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs whitespace-nowrap ${
                                nodeInfo.fangyu === "true"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                  : "bg-muted/50 text-muted-foreground border border-border/40"
                              }`}
                            >
                              {nodeInfo.fangyu === "true" ? "✓" : "✗"} 防御
                            </span>
                            <span
                              className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs whitespace-nowrap ${
                                nodeInfo.udp === "true"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                  : "bg-muted/50 text-muted-foreground border border-border/40"
                              }`}
                            >
                              {nodeInfo.udp === "true" ? "✓" : "✗"} UDP
                            </span>
                            <span
                              className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs whitespace-nowrap ${
                                nodeInfo.web === "yes"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                  : "bg-muted/50 text-muted-foreground border border-border/40"
                              }`}
                            >
                              {nodeInfo.web === "yes" ? "✓" : "✗"} 建站
                            </span>
                          </div>
                        </div>
                      </div>

                      {nodeInfo.notes && (
                        <div className="relative mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-border/50 flex items-start gap-3 text-xs sm:text-sm">
                          <span className="text-muted-foreground min-w-[70px] sm:min-w-[90px]">
                            备注
                          </span>
                          <span className="flex-1 text-muted-foreground/80">
                            {nodeInfo.notes}
                          </span>
                        </div>
                      )}
                    </div>

                    {(nodeInfo.load1 !== undefined ||
                      nodeInfo.bandwidth_usage_percent !== undefined) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        {nodeInfo.load1 !== undefined && (
                          <div className="p-3 sm:p-4 bg-gradient-to-br from-muted/30 to-muted/10 rounded-lg border border-border/40">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-muted-foreground">
                                系统负载
                              </span>
                              <span className="text-[10px] sm:text-xs font-medium font-mono">
                                {nodeInfo.num_cores
                                  ? `${nodeInfo.num_cores} 核心`
                                  : ""}
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-muted-foreground">
                                  1分钟
                                </span>
                                <span className="text-sm font-semibold">
                                  {nodeInfo.load1.toFixed(2)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-muted-foreground">
                                  5分钟
                                </span>
                                <span className="text-sm font-semibold">
                                  {nodeInfo.load5.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        {nodeInfo.bandwidth_usage_percent !== undefined && (
                          <div className="p-3 sm:p-4 bg-gradient-to-br from-muted/30 to-muted/10 rounded-lg border border-border/40">
                            <div className="flex items-center justify-between mb-2 sm:mb-3">
                              <span className="text-xs text-muted-foreground">
                                带宽使用率
                              </span>
                            </div>
                            <div className="flex items-end gap-2">
                              <span className="text-xl sm:text-2xl font-bold">
                                {nodeInfo.bandwidth_usage_percent.toFixed(1)}
                              </span>
                              <span className="text-xs sm:text-sm text-muted-foreground mb-0.5 sm:mb-1">
                                %
                              </span>
                            </div>
                            <div className="mt-2 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  nodeInfo.bandwidth_usage_percent < 50
                                    ? "bg-emerald-500"
                                    : nodeInfo.bandwidth_usage_percent < 80
                                      ? "bg-yellow-500"
                                      : "bg-red-500"
                                }`}
                                style={{
                                  width: `${Math.min(nodeInfo.bandwidth_usage_percent, 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {(nodeInfo.totalTrafficIn !== undefined ||
                      nodeInfo.totalTrafficOut !== undefined) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className="p-3 sm:p-4 bg-gradient-to-br from-blue-500/5 to-transparent rounded-lg border border-border/40">
                          <div className="flex items-center gap-2 mb-2">
                            <svg
                              className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                              />
                            </svg>
                            <span className="text-xs text-muted-foreground">
                              入站流量
                            </span>
                          </div>
                          <span className="text-base sm:text-lg font-semibold">
                            {formatBytes(nodeInfo.totalTrafficIn)}
                          </span>
                        </div>
                        <div className="p-3 sm:p-4 bg-gradient-to-br from-emerald-500/5 to-transparent rounded-lg border border-border/40">
                          <div className="flex items-center gap-2 mb-2">
                            <svg
                              className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                              />
                            </svg>
                            <span className="text-xs text-muted-foreground">
                              出站流量
                            </span>
                          </div>
                          <span className="text-base sm:text-lg font-semibold">
                            {formatBytes(nodeInfo.totalTrafficOut)}
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

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
            <div className="flex-1 min-h-0 overflow-y-auto pr-4">
              <div className="space-y-4 pb-3">
                <div className="space-y-2">
                  <Label htmlFor="tunnelName" className="text-sm font-medium">
                    隧道名称
                  </Label>
                  <Input
                    id="tunnelName"
                    value={tunnelName}
                    onChange={(e) => setTunnelName(e.target.value)}
                    placeholder="为您的隧道起个名字"
                    required
                    className="h-10 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="localIp" className="text-sm font-medium">
                      本地地址
                    </Label>
                    <Input
                      id="localIp"
                      value={localIp}
                      onChange={(e) => setLocalIp(e.target.value)}
                      placeholder="127.0.0.1"
                      required
                      className="h-10 font-mono shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="localPort" className="text-sm font-medium">
                      本地端口
                    </Label>
                    <Input
                      id="localPort"
                      type="number"
                      value={localPort}
                      onChange={(e) => setLocalPort(e.target.value)}
                      required
                      className="h-10 font-mono shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="portType" className="text-sm font-medium">
                      协议类型
                    </Label>
                    <Select
                      options={[
                        { value: "TCP", label: "TCP" },
                        { value: "UDP", label: "UDP" },
                        { value: "HTTP", label: "HTTP" },
                        { value: "HTTPS", label: "HTTPS" },
                      ]}
                      value={portType}
                      onChange={(value) => setPortType(value as string)}
                    />
                  </div>

                  {portType === "HTTP" || portType === "HTTPS" ? (
                    <div className="space-y-2">
                      <Label htmlFor="domain" className="text-sm font-medium">
                        域名
                      </Label>
                      <Input
                        id="domain"
                        type="text"
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                        placeholder="example.com"
                        required
                        className="h-10 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label
                        htmlFor="remotePort"
                        className="text-sm font-medium"
                      >
                        远程端口
                      </Label>
                      <Input
                        id="remotePort"
                        type="number"
                        value={remotePort}
                        onChange={(e) => setRemotePort(e.target.value)}
                        required
                        className="h-10 font-mono shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                  )}
                </div>

                <Accordion
                  type="single"
                  collapsible
                  className="border rounded-lg"
                >
                  <AccordionItem value="advanced" className="border-0">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                      <span className="text-sm font-medium">高级选项</span>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label
                            htmlFor="extraParams"
                            className="text-sm font-medium"
                          >
                            额外参数
                            <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                              （可选）
                            </span>
                          </Label>
                          <Input
                            id="extraParams"
                            value={extraParams}
                            onChange={(e) => setExtraParams(e.target.value)}
                            placeholder="额外的配置参数"
                            className="h-10 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>

                        <div className="flex items-center gap-6">
                          <label className="group flex items-center gap-2.5 text-sm cursor-pointer hover:text-primary transition-colors">
                            <input
                              type="checkbox"
                              checked={encryption}
                              onChange={(e) => setEncryption(e.target.checked)}
                              className="w-4 h-4 rounded border-input cursor-pointer transition-colors checked:bg-primary checked:border-primary focus:ring-2 focus:ring-ring focus:ring-offset-2"
                            />
                            <span className="font-medium">加密传输</span>
                          </label>
                          <label className="group flex items-center gap-2.5 text-sm cursor-pointer hover:text-primary transition-colors">
                            <input
                              type="checkbox"
                              checked={compression}
                              onChange={(e) => setCompression(e.target.checked)}
                              className="w-4 h-4 rounded border-input cursor-pointer transition-colors checked:bg-primary checked:border-primary focus:ring-2 focus:ring-ring focus:ring-offset-2"
                            />
                            <span className="font-medium">数据压缩</span>
                          </label>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </div>

            <DialogFooter className="shrink-0 pt-3 border-t gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={loading}
                className="min-w-[100px]"
              >
                返回
              </Button>
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
                    创建中
                  </span>
                ) : (
                  "创建隧道"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
