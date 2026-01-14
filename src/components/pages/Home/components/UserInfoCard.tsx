import type { UserInfo } from "@/services/api";
import { Progress } from "@/components/ui/progress";
import { User, Layers, Database } from "lucide-react";

interface UserInfoCardProps {
  userInfo: UserInfo | null;
}

export function UserInfoCard({ userInfo }: UserInfoCardProps) {
  const tunnelPercentage = userInfo
    ? Math.min((userInfo.tunnelCount / userInfo.tunnel) * 100, 100)
    : 0;

  return (
    <div className="border border-border/60 rounded-lg p-5 bg-card flex flex-col h-[160px]">
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
        <div className="space-y-4 flex-1">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-foreground/5 flex items-center justify-center">
              {userInfo.userimg ? (
                <img
                  src={userInfo.userimg}
                  alt={userInfo.username}
                  className="h-full w-full rounded-lg object-cover"
                />
              ) : (
                <User className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <div className="font-medium text-sm text-foreground">
                {userInfo.username}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Layers className="w-3 h-3" />
                {userInfo.usergroup || "默认分组"}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
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
