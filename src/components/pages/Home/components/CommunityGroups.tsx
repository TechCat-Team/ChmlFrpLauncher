import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface QQGroup {
  name: string;
  url: string;
  number: string;
}

interface WeChatGroup {
  name: string;
  qrCodeImage: string;
}

interface CommunityGroupsProps {
  qqGroups?: QQGroup[];
  weChatGroup?: WeChatGroup;
  className?: string;
}

const defaultQQGroups: QQGroup[] = [
  {
    name: "QQ一群",
    url: "https://qm.qq.com/q/x2OFaogI2k",
    number: "992067118",
  },
  {
    name: "QQ二群",
    url: "https://qm.qq.com/q/sEZl1fea40",
    number: "592908249",
  },
  {
    name: "QQ三群",
    url: "https://qm.qq.com/q/RGALEU5cA0",
    number: "838521529",
  },
];

const defaultWeChatGroup: WeChatGroup = {
  name: "微信交流群",
  qrCodeImage: "/wechat-qrcode.jpg",
};

export function CommunityGroups({
  qqGroups = defaultQQGroups,
  weChatGroup = defaultWeChatGroup,
  className,
}: CommunityGroupsProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <div className={cn("w-full space-y-4", className)}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* QQ群按钮 */}
        {qqGroups.map((group, index) => (
          <Button
            key={index}
            variant="outline"
            className="h-auto py-3 px-4 flex flex-col items-start gap-1 !bg-card dark:!bg-card hover:bg-accent/50 transition-all group"
            asChild
          >
            <a href={group.url} target="_blank" rel="noopener noreferrer">
              <div className="flex items-center justify-between w-full">
                <span className="font-medium">{group.name}</span>
              </div>
              <span className="text-xs text-muted-foreground group-hover:text-muted-foreground/80">
                {group.number}
              </span>
            </a>
          </Button>
        ))}

        {/* 微信群 - 鼠标悬停显示二维码 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              className="h-auto py-3 px-4 flex flex-col items-start gap-1 !bg-card dark:!bg-card hover:bg-accent/50 transition-all group"
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-medium">{weChatGroup.name}</span>
              </div>
              <span className="text-xs text-muted-foreground group-hover:text-muted-foreground/80">
                扫描二维码加入
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="p-4 bg-background border border-border shadow-lg"
          >
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-muted-foreground mb-1">
                扫描二维码加入微信群
              </p>
              {!imageError ? (
                <img
                  src={weChatGroup.qrCodeImage}
                  alt="微信群二维码"
                  className="w-36 h-36 rounded border border-border/50 bg-white dark:bg-white object-contain"
                  onError={() => setImageError(true)}
                />
              ) : (
                <div className="w-36 h-36 rounded border border-border/50 bg-muted flex items-center justify-center text-xs text-muted-foreground text-center px-2">
                  二维码加载失败
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
