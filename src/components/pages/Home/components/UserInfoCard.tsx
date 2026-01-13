import type { UserInfo } from "@/services/api";

interface UserInfoCardProps {
  userInfo: UserInfo | null;
}

export function UserInfoCard({ userInfo }: UserInfoCardProps) {
  return (
    <div className="border border-border/60 rounded-lg p-5 bg-card">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">账号状态</h2>
        <span
          className={`text-[11px] px-2 py-1 rounded ${
            userInfo
              ? "bg-foreground text-background"
              : "border border-border/60 text-muted-foreground"
          }`}
        >
          {userInfo ? "已登录" : "未登录"}
        </span>
      </div>
      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
        {userInfo ? (
          <>
            <p className="text-foreground">你好，{userInfo.username}</p>
            <p>用户组：{userInfo.usergroup || "未分组"}</p>
            <p>
              隧道量：{userInfo.tunnelCount} / {userInfo.tunnel}
            </p>
          </>
        ) : (
          <p>点击左侧头像即可登录账号，登录后会在这里显示用户信息。</p>
        )}
      </div>
    </div>
  );
}

