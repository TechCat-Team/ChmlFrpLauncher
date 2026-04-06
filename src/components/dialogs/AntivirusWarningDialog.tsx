import { useState, useEffect } from "react";
import { AlertTriangle, X, Copy, Check } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface AntivirusWarningDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
}

export function AntivirusWarningDialog({
  isOpen,
  onClose,
  onConfirm,
}: AntivirusWarningDialogProps) {
  const [frpcDir, setFrpcDir] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      invoke<string>("get_frpc_directory")
        .then(setFrpcDir)
        .catch((err) => console.error("获取frpc目录失败:", err));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm?.();
    onClose();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(frpcDir);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("复制失败:", err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card/95 backdrop-blur-md border border-border/50 p-8 shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-foreground to-foreground/80 flex items-center justify-center shadow-sm">
              <AlertTriangle className="w-5 h-5 text-background" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">下载被拦截</h2>
              <p className="text-xs text-muted-foreground">
                杀毒软件阻止了下载
              </p>
            </div>
          </div>
          <button
            type="button"
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-all duration-200 flex items-center justify-center"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            frpc 客户端可能被杀毒软件（如 Windows Defender）误判为可疑程序。
          </p>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">
              frpc 安装目录：
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 rounded-lg border border-border/50 bg-background/50 text-xs font-mono text-foreground break-all">
                {frpcDir || "加载中..."}
              </div>
              <button
                onClick={handleCopy}
                disabled={!frpcDir}
                className="flex-shrink-0 h-8 w-8 rounded-lg border border-border/50 bg-background/50 flex items-center justify-center hover:bg-foreground/5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                title="复制路径"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">解决方法：</p>
            <ol className="space-y-2 text-sm text-muted-foreground pl-5 list-decimal">
              <li>打开杀毒软件设置</li>
              <li>将上面的目录添加到白名单</li>
              <li>重新下载 frpc 客户端</li>
            </ol>
          </div>
        </div>

        {/* 按钮 */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-xl border border-border/50 bg-background/50 text-sm font-medium text-foreground hover:bg-foreground/5 transition-all duration-200"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-3 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-all duration-200 shadow-sm"
          >
            前往设置
          </button>
        </div>
      </div>
    </div>
  );
}
