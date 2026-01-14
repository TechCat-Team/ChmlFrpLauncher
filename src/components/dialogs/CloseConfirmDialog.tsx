import { MinusSquare, X } from "lucide-react";

interface CloseConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimizeToTray: () => void;
  onCloseApp: () => void;
}

export function CloseConfirmDialog({
  isOpen,
  onClose,
  onMinimizeToTray,
  onCloseApp,
}: CloseConfirmDialogProps) {
  if (!isOpen) return null;

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
          <div>
            <h2 className="text-lg font-bold text-foreground">关闭窗口</h2>
            <p className="text-xs text-muted-foreground mt-1">
              您希望关闭窗口后应用如何运行？
            </p>
          </div>
        </div>

        {/* 内容 */}
        <div className="grid gap-3 mb-6">
          <button
            onClick={onMinimizeToTray}
            className="flex items-start gap-4 p-4 rounded-lg border border-border/60 bg-card hover:bg-accent/50 transition-colors text-left group"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors flex-shrink-0">
              <MinusSquare className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm mb-1">最小化到系统托盘</div>
              <div className="text-xs text-muted-foreground">
                应用将在后台运行，可以从系统托盘重新打开窗口
              </div>
            </div>
          </button>

          <button
            onClick={onCloseApp}
            className="flex items-start gap-4 p-4 rounded-lg border border-border/60 bg-card hover:bg-accent/50 transition-colors text-left group"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-destructive/10 group-hover:bg-destructive/20 transition-colors flex-shrink-0">
              <X className="w-5 h-5 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm mb-1">退出应用</div>
              <div className="text-xs text-muted-foreground">
                完全关闭应用程序，停止所有后台任务
              </div>
            </div>
          </button>
        </div>

        {/* 提示信息 */}
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground text-center">
            您的选择将被记住，下次关闭窗口时不会再次询问
          </div>
          <div className="text-xs text-muted-foreground text-center">
            您可以在设置中修改此行为
          </div>
        </div>
      </div>
    </div>
  );
}
