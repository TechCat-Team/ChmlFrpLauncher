import { useState, useEffect, useMemo } from "react";

export type CloseBehavior = "minimize_to_tray" | "close_app" | "ask";

export function useCloseBehavior() {
  const [closeBehavior, setCloseBehavior] = useState<CloseBehavior>(() => {
    if (typeof window === "undefined") return "ask";
    const stored = localStorage.getItem("closeBehavior");
    if (
      stored === "minimize_to_tray" ||
      stored === "close_app" ||
      stored === "ask"
    ) {
      return stored;
    }
    return "ask";
  });

  const closeToTrayEnabled = useMemo(() => {
    return closeBehavior === "minimize_to_tray";
  }, [closeBehavior]);

  useEffect(() => {
    localStorage.setItem("closeBehavior", closeBehavior);
    // 触发事件通知其他组件
    window.dispatchEvent(
      new CustomEvent("closeBehaviorChanged", { detail: closeBehavior }),
    );
  }, [closeBehavior]);

  const handleToggleCloseToTray = (enabled: boolean) => {
    const newBehavior: CloseBehavior = enabled
      ? "minimize_to_tray"
      : "close_app";
    setCloseBehavior(newBehavior);
  };

  return {
    closeBehavior,
    closeToTrayEnabled,
    setCloseBehavior,
    handleToggleCloseToTray,
  };
}
