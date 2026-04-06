import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { NodeInfo } from "@/services/api";
import { getPorts, type PortCheckResult, type PortUsage } from "@/services/ports";
import { RefreshCw, Search } from "lucide-react";

export interface TunnelFormData {
  tunnelName: string;
  localIp: string;
  portType: string;
  localPort: string;
  remotePort: string;
  domain: string;
  encryption: boolean;
  compression: boolean;
  extraParams: string;
}

interface TunnelFormProps {
  formData: TunnelFormData;
  onChange: (data: Partial<TunnelFormData>) => void;
  nodeInfo: NodeInfo | null;
  disabled?: boolean;
  portStatus?: (PortCheckResult & { checking: boolean; checkedPort: string }) | null;
  portStatusError?: string | null;
}

export function TunnelForm({
  formData,
  onChange,
  nodeInfo,
  disabled = false,
  portStatus = null,
  portStatusError = null,
}: TunnelFormProps) {
  const [portQueryOpen, setPortQueryOpen] = useState(false);
  const [portQueryLoading, setPortQueryLoading] = useState(false);
  const [portQueryError, setPortQueryError] = useState<string | null>(null);
  const [portUsageList, setPortUsageList] = useState<PortUsage[] | null>(null);
  const [queryKeyword, setQueryKeyword] = useState("");

  const handleCopyNodeIp = useCallback(async (ip: string) => {
    try {
      await navigator.clipboard.writeText(ip);
      toast.success("节点 IP 已复制");
    } catch (error) {
      console.error("Failed to copy IP:", error);
      toast.error("复制失败");
    }
  }, []);

  const handleOpenCnameDoc = useCallback(async () => {
    try {
      await openUrl("https://docs.chmlfrp.net/docs/dns/cname.html");
    } catch (error) {
      console.error("Failed to open URL:", error);
      toast.error("打开链接失败");
    }
  }, []);

  const isHttpProtocol =
    formData.portType === "HTTP" || formData.portType === "HTTPS";

  const currentPort = formData.localPort.trim();
  const hasMatchedPortStatus = portStatus?.checkedPort === currentPort;
  const localPortStatusText =
    !portStatus?.checking &&
    !portStatusError &&
    hasMatchedPortStatus &&
    portStatus.occupied
      ? `进程：${portStatus.process || "未知进程"} (PID ${portStatus.pid || "未知"})`
      : !portStatus?.checking && portStatusError
        ? portStatusError
        : "";
  const localPortStatusClass = portStatusError
    ? "text-destructive"
    : "text-emerald-600";

  const normalizeProtocol = useCallback((protocol?: string) => {
    if (!protocol) return "-";
    const normalized = protocol.toUpperCase();
    if (normalized.includes("TCP")) return "TCP";
    if (normalized.includes("UDP")) return "UDP";
    return normalized;
  }, []);

  const fetchPortUsageList = useCallback(async () => {
    try {
      setPortQueryLoading(true);
      setPortQueryError(null);
      const data = await getPorts();
      setPortUsageList(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "获取端口占用失败";
      setPortQueryError(message);
      setPortUsageList(null);
    } finally {
      setPortQueryLoading(false);
    }
  }, []);

  const handleOpenPortQuery = useCallback(async () => {
    setPortQueryOpen(true);
    if (portUsageList === null) {
      await fetchPortUsageList();
    }
  }, [fetchPortUsageList, portUsageList]);

  const handleSelectPort = useCallback(
    (item: PortUsage) => {
      const normalized = normalizeProtocol(item.protocol);
      const updates: Partial<TunnelFormData> = {
        localPort: String(item.port),
      };

      if (normalized === "TCP" || normalized === "UDP") {
        updates.portType = normalized;
      }

      onChange(updates);
      setPortQueryOpen(false);
    },
    [normalizeProtocol, onChange],
  );

  const normalizedQueryKeyword = queryKeyword.trim().toLowerCase();
  const filteredPortUsageList = useMemo(() => {
    if (!portUsageList) return [];
    return portUsageList.filter((item) => {
      if (!normalizedQueryKeyword) return true;
      const processText = (item.process || "").toLowerCase();
      const pidText = String(item.pid || "");
      const portText = String(item.port || "");
      return (
        processText.includes(normalizedQueryKeyword) ||
        pidText.includes(normalizedQueryKeyword) ||
        portText.includes(normalizedQueryKeyword)
      );
    });
  }, [normalizedQueryKeyword, portUsageList]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pr-4 transition-all duration-300 ease-in-out">
      <div className="space-y-4 pb-3">
        {nodeInfo && isHttpProtocol && (
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800/50 dark:bg-blue-950/30">
            <svg
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-xs leading-relaxed text-blue-700 dark:text-blue-300">
              使用 {formData.portType} 隧道时，需要将
              <span className="mx-1 font-mono font-semibold">
                {formData.domain || "您的域名"}
              </span>
              通过
              <button
                type="button"
                onClick={handleOpenCnameDoc}
                className="mx-1 rounded px-0.5 underline decoration-dotted underline-offset-2 hover:decoration-solid focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              >
                CNAME 解析
              </button>
              指向
              <button
                type="button"
                onClick={() => handleCopyNodeIp(nodeInfo.ip)}
                className="mx-1 cursor-pointer rounded px-0.5 font-mono font-semibold underline decoration-dotted underline-offset-2 hover:decoration-solid focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                title="点击复制"
              >
                {nodeInfo.ip}
              </button>
              才能正常访问。
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="tunnelName" className="text-sm font-medium">
            隧道名称
          </Label>
          <Input
            id="tunnelName"
            value={formData.tunnelName}
            onChange={(e) => onChange({ tunnelName: e.target.value })}
            placeholder="为您的隧道起一个名字"
            required
            disabled={disabled}
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
              value={formData.localIp}
              onChange={(e) => onChange({ localIp: e.target.value })}
              placeholder="127.0.0.1"
              required
              disabled={disabled}
              className="h-10 font-mono shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="localPort" className="text-sm font-medium">
                本地端口
              </Label>
              <span
                className={cn(
                  "min-h-4 max-w-[70%] truncate text-xs",
                  localPortStatusClass,
                )}
              >
                {localPortStatusText}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="localPort"
                type="number"
                value={formData.localPort}
                onChange={(e) => onChange({ localPort: e.target.value })}
                required
                disabled={disabled}
                className="h-10 font-mono shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={disabled}
                    onClick={handleOpenPortQuery}
                    className="h-10 w-10 shrink-0 border border-input"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">查询并选择本机进程占用端口</TooltipContent>
              </Tooltip>
            </div>
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
              value={formData.portType}
              onChange={(value) => onChange({ portType: value as string })}
            />
          </div>

          {isHttpProtocol ? (
            <div className="space-y-2">
              <Label htmlFor="domain" className="text-sm font-medium">
                域名
              </Label>
              <Input
                id="domain"
                type="text"
                value={formData.domain}
                onChange={(e) => onChange({ domain: e.target.value })}
                placeholder="example.com"
                required
                disabled={disabled}
                className="h-10 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="remotePort" className="text-sm font-medium">
                远程端口
              </Label>
              <Input
                id="remotePort"
                type="number"
                value={formData.remotePort}
                onChange={(e) => onChange({ remotePort: e.target.value })}
                required
                disabled={disabled}
                className="h-10 font-mono shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          )}
        </div>

        <Accordion type="single" collapsible className="rounded-lg border">
          <AccordionItem value="advanced" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <span className="text-sm font-medium">高级选项</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="extraParams" className="text-sm font-medium">
                    额外参数
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      （可选）
                    </span>
                  </Label>
                  <Input
                    id="extraParams"
                    value={formData.extraParams}
                    onChange={(e) => onChange({ extraParams: e.target.value })}
                    placeholder="额外的配置参数"
                    disabled={disabled}
                    className="h-10 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>

                <div className="flex items-center gap-6">
                  <label className="group flex cursor-pointer items-center gap-2.5 text-sm transition-colors hover:text-primary">
                    <input
                      type="checkbox"
                      checked={formData.encryption}
                      onChange={(e) =>
                        onChange({ encryption: e.target.checked })
                      }
                      disabled={disabled}
                      className="h-4 w-4 cursor-pointer rounded border-input transition-colors checked:border-primary checked:bg-primary focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    />
                    <span className="font-medium">加密传输</span>
                  </label>
                  <label className="group flex cursor-pointer items-center gap-2.5 text-sm transition-colors hover:text-primary">
                    <input
                      type="checkbox"
                      checked={formData.compression}
                      onChange={(e) =>
                        onChange({ compression: e.target.checked })
                      }
                      disabled={disabled}
                      className="h-4 w-4 cursor-pointer rounded border-input transition-colors checked:border-primary checked:bg-primary focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    />
                    <span className="font-medium">数据压缩</span>
                  </label>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <Dialog open={portQueryOpen} onOpenChange={setPortQueryOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>选择本地端口</DialogTitle>
            <DialogDescription>
              查询本机端口占用，点击任一进程即可自动填入本地端口
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={queryKeyword}
                onChange={(e) => setQueryKeyword(e.target.value)}
                placeholder="搜索进程名 / 端口 / PID"
                className="transition-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <Button
                type="button"
                variant="outline"
                onClick={fetchPortUsageList}
                disabled={portQueryLoading}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${portQueryLoading ? "animate-spin" : ""}`} />
                刷新
              </Button>
            </div>

            {portQueryError && (
              <div className="rounded-xl border bg-red-50 p-2 text-sm text-red-600">
                获取端口占用失败：{portQueryError}
              </div>
            )}

            {portQueryLoading && (
              <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
                正在加载端口占用情况...
              </div>
            )}

            {!portQueryLoading && portUsageList && portUsageList.length === 0 && (
              <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
                暂无端口占用数据
              </div>
            )}

            {!portQueryLoading &&
              portUsageList &&
              portUsageList.length > 0 &&
              filteredPortUsageList.length === 0 &&
              normalizedQueryKeyword && (
                <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
                  未找到匹配项：{queryKeyword}
                </div>
              )}

            {!portQueryLoading && filteredPortUsageList.length > 0 && (
              <div className="max-h-[360px] overflow-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px]">端口</TableHead>
                      <TableHead className="w-[90px]">PID</TableHead>
                      <TableHead>进程</TableHead>
                      <TableHead className="w-[90px]">协议</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPortUsageList.map((item) => (
                      <TableRow
                        key={`${item.port}-${item.pid}-${item.protocol || ""}`}
                        className="cursor-pointer"
                        onClick={() => handleSelectPort(item)}
                      >
                        <TableCell className="font-medium">{item.port}</TableCell>
                        <TableCell>{item.pid}</TableCell>
                        <TableCell>{item.process || "-"}</TableCell>
                        <TableCell>{normalizeProtocol(item.protocol)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
