import { useState } from "react";
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
import { customTunnelService } from "@/services/customTunnelService";

interface CustomTunnelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CustomTunnelDialog({
  open,
  onOpenChange,
  onSuccess,
}: CustomTunnelDialogProps) {
  const [loading, setLoading] = useState(false);
  const [configContent, setConfigContent] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!configContent.trim()) {
      toast.error("请填写配置文件内容");
      return;
    }

    try {
      setLoading(true);

      // 使用空字符串作为隧道名，后端会从配置文件中提取
      await customTunnelService.saveCustomTunnel("", configContent);

      toast.success("自定义隧道创建成功");
      onSuccess();
      handleClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "创建自定义隧道失败";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setConfigContent("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>创建自定义隧道</DialogTitle>
          <DialogDescription>
            填写 .ini 配置文件内容创建自定义隧道
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="configContent" className="text-sm font-medium">
              配置文件内容
            </Label>
            <textarea
              id="configContent"
              value={configContent}
              onChange={(e) => setConfigContent(e.target.value)}
              placeholder="粘贴您的 frpc 配置文件内容...&#10;"
              className="w-full min-h-[200px] p-3 bg-muted/30 rounded-lg border border-border/40 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={loading}
              required
            />
            <p className="text-xs text-muted-foreground">
              直接粘贴完整的 frpc INI 配置内容
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
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
      </DialogContent>
    </Dialog>
  );
}
