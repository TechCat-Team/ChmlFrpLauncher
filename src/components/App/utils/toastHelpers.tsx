import React from "react";
import { Progress } from "@/components/ui/progress";

export function createDownloadProgressToast(
  percentage: number,
  downloaded: number,
  total: number,
) {
  return React.createElement(
    "div",
    { className: "space-y-2" },
    React.createElement(
      "div",
      { className: "text-sm font-medium" },
      "正在下载 frpc 客户端...",
    ),
    React.createElement(Progress, { value: percentage }),
    React.createElement(
      "div",
      { className: "text-xs text-muted-foreground" },
      `${percentage.toFixed(1)}% (${(downloaded / 1024 / 1024).toFixed(2)} MB / ${(total / 1024 / 1024).toFixed(2)} MB)`,
    ),
  );
}

export function createDownloadInitialToast() {
  return React.createElement(
    "div",
    { className: "space-y-2" },
    React.createElement(
      "div",
      { className: "text-sm font-medium" },
      "正在下载 frpc 客户端...",
    ),
    React.createElement(Progress, { value: 0 }),
    React.createElement(
      "div",
      { className: "text-xs text-muted-foreground" },
      "0.0%",
    ),
  );
}

export function createDownloadErrorToast(errorMsg: string) {
  return React.createElement(
    "div",
    { className: "space-y-2" },
    React.createElement(
      "div",
      { className: "text-sm font-medium" },
      "frpc 客户端下载失败",
    ),
    React.createElement(
      "div",
      { className: "text-xs text-muted-foreground" },
      errorMsg,
    ),
    React.createElement(
      "div",
      { className: "text-xs" },
      "请前往设置页面重新下载",
    ),
  );
}

export function createUpdateInfoToast(version: string) {
  return React.createElement(
    "div",
    { className: "space-y-2" },
    React.createElement(
      "div",
      { className: "text-sm font-medium" },
      `发现新版本: ${version}`,
    ),
    React.createElement(
      "div",
      { className: "text-xs text-muted-foreground mt-1" },
      "更新将在后台下载，完成后会提示您安装",
    ),
  );
}

export function createTunnelSuccessToast(
  tunnelName: string,
  linkAddress: string,
  onCopy: () => void,
) {
  return React.createElement(
    "div",
    { className: "space-y-2" },
    React.createElement(
      "div",
      { className: "text-sm font-medium" },
      `隧道 ${tunnelName} 启动成功，点击复制链接地址`,
    ),
    React.createElement(
      "div",
      { className: "flex items-center gap-2" },
      React.createElement(
        "span",
        { className: "text-xs text-muted-foreground font-mono" },
        linkAddress,
      ),
      React.createElement(
        "button",
        {
          onClick: onCopy,
          className:
            "text-xs px-2 py-1 bg-foreground/10 hover:bg-foreground/20 rounded transition-colors",
        },
        "复制",
      ),
    ),
  );
}
