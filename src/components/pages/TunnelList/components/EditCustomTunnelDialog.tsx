import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  customTunnelService,
  type CustomTunnel,
} from "@/services/customTunnelService";

interface EditCustomTunnelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  tunnel: CustomTunnel | null;
}

export function EditCustomTunnelDialog({
  open,
  onOpenChange,
  onSuccess,
  tunnel,
}: EditCustomTunnelDialogProps) {
  const [loading, setLoading] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configContent, setConfigContent] = useState("");

  // 当隧道数据变化时，加载配置文件内容
  useEffect(() => {
    const loadConfigContent = async () => {
      if (open && tunnel) {
        try {
          setLoadingConfig(true);
          const content = await customTunnelService.getCustomTunnelConfig(
            tunnel.id,
          );
          setConfigContent(content);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "加载配置文件失败";
          toast.error(message);
          console.error("加载配置文件失败:", error);
        } finally {
          setLoadingConfig(false);
        }
      } else if (!open) {
        // 对话框关闭时重置状态
        setLoadingConfig(true);
      }
    };

    loadConfigContent();
  }, [open, tunnel]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tunnel) {
      toast.error("隧道信息错误");
      return;
    }

    if (!configContent.trim()) {
      toast.error("请填写配置文件内容");
      return;
    }

    try {
      setLoading(true);

      await customTunnelService.updateCustomTunnel(tunnel.id, configContent);

      toast.success("自定义隧道更新成功");
      onSuccess();
      handleClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "更新自定义隧道失败";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setConfigContent("");
    onOpenChange(false);
  };

  if (!tunnel) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>编辑自定义隧道</DialogTitle>
          <DialogDescription>
            修改 frpc 配置文件内容 - {tunnel.name}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="py-4">
          <div className="min-h-[385px] mb-4">
            {loadingConfig ? (
              <div className="flex items-center justify-center gap-2 h-[385px] text-sm text-muted-foreground">
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
                <span>加载配置文件中...</span>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="configContent" className="text-sm font-medium">
                  配置文件内容
                </Label>
                <textarea
                  id="configContent"
                  value={configContent}
                  onChange={(e) => setConfigContent(e.target.value)}
                  placeholder="粘贴您的 frpc 配置文件内容...&#10;&#10;例如：&#10;[common]&#10;server_addr = example.com&#10;server_port = 7000&#10;&#10;[ssh]&#10;type = tcp&#10;local_ip = 127.0.0.1&#10;local_port = 22&#10;remote_port = 6000"
                  className="w-full min-h-[300px] p-3 bg-muted/30 rounded-lg border border-border/40 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={loading}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  直接粘贴完整的 frpc INI 配置内容
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading || loadingConfig}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading || loadingConfig}>
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
                "保存更改"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
