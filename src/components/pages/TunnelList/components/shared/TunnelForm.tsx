import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { NodeInfo } from "@/services/api";

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
}

export function TunnelForm({
  formData,
  onChange,
  nodeInfo,
  disabled = false,
}: TunnelFormProps) {
  const handleCopyNodeIp = useCallback(async (ip: string) => {
    try {
      await navigator.clipboard.writeText(ip);
      toast.success("节点IP已复制");
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

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pr-4 transition-all duration-300 ease-in-out">
      <div className="space-y-4 pb-3">
        {nodeInfo && isHttpProtocol && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50">
            <svg
              className="w-4 h-4 mt-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0"
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
            <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
              使用{formData.portType}隧道需要将您的{" "}
              <span className="font-mono font-semibold">
                {formData.domain || "您的域名"}
              </span>{" "}
              域名通过
              <button
                type="button"
                onClick={handleOpenCnameDoc}
                className="underline decoration-dotted underline-offset-2 hover:decoration-solid focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded px-0.5 mx-0.5"
              >
                CNAME解析
              </button>
              至{" "}
              <button
                type="button"
                onClick={() => handleCopyNodeIp(nodeInfo.ip)}
                className="font-mono font-semibold underline decoration-dotted underline-offset-2 hover:decoration-solid focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded px-0.5 cursor-pointer"
                title="点击复制"
              >
                {nodeInfo.ip}
              </button>{" "}
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
            placeholder="为您的隧道起个名字"
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
            <Label htmlFor="localPort" className="text-sm font-medium">
              本地端口
            </Label>
            <Input
              id="localPort"
              type="number"
              value={formData.localPort}
              onChange={(e) => onChange({ localPort: e.target.value })}
              required
              disabled={disabled}
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

        <Accordion type="single" collapsible className="border rounded-lg">
          <AccordionItem value="advanced" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <span className="text-sm font-medium">高级选项</span>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="extraParams" className="text-sm font-medium">
                    额外参数
                    <span className="ml-1.5 text-xs text-muted-foreground font-normal">
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
                  <label className="group flex items-center gap-2.5 text-sm cursor-pointer hover:text-primary transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.encryption}
                      onChange={(e) =>
                        onChange({ encryption: e.target.checked })
                      }
                      disabled={disabled}
                      className="w-4 h-4 rounded border-input cursor-pointer transition-colors checked:bg-primary checked:border-primary focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    />
                    <span className="font-medium">加密传输</span>
                  </label>
                  <label className="group flex items-center gap-2.5 text-sm cursor-pointer hover:text-primary transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.compression}
                      onChange={(e) =>
                        onChange({ compression: e.target.checked })
                      }
                      disabled={disabled}
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
  );
}
