import React from "react";

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
