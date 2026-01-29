import type { UserInfo } from "@/services/api";
import { Progress } from "@/components/ui/progress";
import { User, Network, Download, Upload, Database } from "lucide-react";

interface UserInfoCardProps {
  userInfo: UserInfo | null;
}

function formatBytes(bytes: number | null) {
  if (!bytes || bytes === 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${Math.round(mb / 1024)} GB`;
  }
  return `${Math.round(mb)} MB`;
}

export function UserInfoCard({ userInfo }: UserInfoCardProps) {
  const tunnelPercentage = userInfo
    ? Math.min((userInfo.tunnelCount / userInfo.tunnel) * 100, 100)
    : 0;

  return (
    <div className="rounded-lg p-5 bg-card flex flex-col h-[160px]">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h2 className="text-sm font-semibold text-foreground">用户信息</h2>
        {userInfo && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
            <span className="relative flex h-1.5 w-1.5">
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
            </span>
            已登录
          </div>
        )}
      </div>

      {userInfo ? (
        <div className="space-y-3 flex-1">
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Network className="w-3 h-3" />
                <span className="text-[10px]">连接数</span>
              </div>
              <span className="font-medium text-foreground text-xs">
                {userInfo.totalCurConns ?? 0}
              </span>
            </div>

            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Download className="w-3 h-3" />
                <span className="text-[10px]">总下载</span>
              </div>
              <span className="font-medium text-foreground text-xs">
                {formatBytes(userInfo.total_download)}
              </span>
            </div>

            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Upload className="w-3 h-3" />
                <span className="text-[10px]">总上传</span>
              </div>
              <span className="font-medium text-foreground text-xs">
                {formatBytes(userInfo.total_upload)}
              </span>
            </div>
          </div>

          <div className="space-y-1.5 mt-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Database className="w-3 h-3" />
                隧道使用量
              </span>
              <span className="font-medium text-foreground">
                {userInfo.tunnelCount} / {userInfo.tunnel}
              </span>
            </div>
            <Progress value={tunnelPercentage} className="h-1.5" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center flex-1 text-center space-y-2">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground max-w-[200px]">
            点击左侧头像登录账号
          </p>
        </div>
      )}
    </div>
  );
}
