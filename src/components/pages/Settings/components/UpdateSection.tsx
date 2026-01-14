import { Sparkles } from "lucide-react";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@/components/ui/item";

interface UpdateSectionProps {
  checkingUpdate: boolean;
  currentVersion: string;
  onCheckUpdate: () => void;
  isDownloading: boolean;
  onRedownloadFrpc: () => void;
}

export function UpdateSection({
  checkingUpdate,
  currentVersion,
  onCheckUpdate,
  isDownloading,
  onRedownloadFrpc,
}: UpdateSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Sparkles className="w-4 h-4" />
        <span>更新与下载</span>
      </div>
      <div className="border border-border/60 rounded-lg bg-card overflow-hidden">
        <Item
          variant="outline"
          className="border-0 border-b border-border/60 last:border-0"
        >
          <ItemContent>
            <ItemTitle>应用更新</ItemTitle>
            <ItemDescription className="text-xs">
              检查并安装应用更新
              {currentVersion && (
                <span className="ml-1">当前版本: v{currentVersion}</span>
              )}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <button
              onClick={onCheckUpdate}
              disabled={checkingUpdate}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                checkingUpdate
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-foreground text-background hover:opacity-90"
              }`}
            >
              {checkingUpdate ? "检查中..." : "检测更新"}
            </button>
          </ItemActions>
        </Item>

        <Item variant="outline" className="border-0">
          <ItemContent>
            <ItemTitle>frpc 客户端</ItemTitle>
            <ItemDescription className="text-xs">
              重新下载 frpc 客户端程序
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <button
              onClick={onRedownloadFrpc}
              disabled={isDownloading}
              className={`px-3 py-1.5 text-xs rounded transition-colors ${
                isDownloading
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-foreground text-background hover:opacity-90"
              }`}
            >
              {isDownloading ? "下载中..." : "重新下载"}
            </button>
          </ItemActions>
        </Item>
      </div>
    </div>
  );
}
