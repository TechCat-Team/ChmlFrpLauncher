import { Settings2 } from "lucide-react";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@/components/ui/item";

interface SystemSectionProps {
  autostartEnabled: boolean;
  autostartLoading: boolean;
  onToggleAutostart: (enabled: boolean) => void;
  autoCheckUpdate: boolean;
  onToggleAutoCheckUpdate: (enabled: boolean) => void;
  closeToTrayEnabled: boolean;
  onToggleCloseToTray: (enabled: boolean) => void;
  guardEnabled: boolean;
  guardLoading: boolean;
  onToggleGuard: (enabled: boolean) => void;
}

export function SystemSection({
  autostartEnabled,
  autostartLoading,
  onToggleAutostart,
  autoCheckUpdate,
  onToggleAutoCheckUpdate,
  closeToTrayEnabled,
  onToggleCloseToTray,
  guardEnabled,
  guardLoading,
  onToggleGuard,
}: SystemSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Settings2 className="w-4 h-4" />
        <span>系统</span>
      </div>
      <div className="border border-border/60 rounded-lg bg-card overflow-hidden">
        <Item
          variant="outline"
          className="border-0 border-b border-border/60 last:border-0"
        >
          <ItemContent>
            <ItemTitle>开机自启</ItemTitle>
            <ItemDescription className="text-xs">
              系统启动时自动运行应用
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <button
              onClick={() => onToggleAutostart(!autostartEnabled)}
              disabled={autostartLoading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none outline-0 ${
                autostartEnabled ? "bg-foreground" : "bg-muted"
              } ${autostartLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              role="switch"
              aria-checked={autostartEnabled}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                  autostartEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </ItemActions>
        </Item>

        <Item
          variant="outline"
          className="border-0 border-b border-border/60 last:border-0"
        >
          <ItemContent>
            <ItemTitle>启动时自动检测更新</ItemTitle>
            <ItemDescription className="text-xs">
              应用启动时自动检查是否有可用更新
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <button
              onClick={() => onToggleAutoCheckUpdate(!autoCheckUpdate)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none outline-0 ${
                autoCheckUpdate ? "bg-foreground" : "bg-muted"
              } cursor-pointer`}
              role="switch"
              aria-checked={autoCheckUpdate}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                  autoCheckUpdate ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </ItemActions>
        </Item>

        <Item
          variant="outline"
          className="border-0 border-b border-border/60 last:border-0"
        >
          <ItemContent>
            <ItemTitle>关闭窗口时最小化到托盘</ItemTitle>
            <ItemDescription className="text-xs">
              关闭窗口后应用在后台运行，可从系统托盘打开
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <button
              onClick={() => onToggleCloseToTray(!closeToTrayEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none outline-0 ${
                closeToTrayEnabled ? "bg-foreground" : "bg-muted"
              } cursor-pointer`}
              role="switch"
              aria-checked={closeToTrayEnabled}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                  closeToTrayEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </ItemActions>
        </Item>

        <Item variant="outline" className="border-0">
          <ItemContent>
            <ItemTitle>进程守护</ItemTitle>
            <ItemDescription className="text-xs">
              自动监控隧道进程，意外退出时自动重启
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <button
              onClick={() => onToggleGuard(!guardEnabled)}
              disabled={guardLoading}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none outline-0 ${
                guardEnabled ? "bg-foreground" : "bg-muted"
              } ${guardLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              role="switch"
              aria-checked={guardEnabled}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                  guardEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </ItemActions>
        </Item>
      </div>
    </div>
  );
}
