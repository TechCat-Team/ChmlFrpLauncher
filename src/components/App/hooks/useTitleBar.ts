import { useState, useEffect } from "react";

/**
 * 标题栏可见性管理 hook
 */
export function useTitleBar() {
  const [showTitleBar, setShowTitleBar] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("showTitleBar");
    if (stored === null) return false;
    return stored === "true";
  });

  useEffect(() => {
    const handleTitleBarVisibilityChange = () => {
      const stored = localStorage.getItem("showTitleBar");
      setShowTitleBar(stored !== "false");
    };

    window.addEventListener(
      "titleBarVisibilityChanged",
      handleTitleBarVisibilityChange,
    );
    return () => {
      window.removeEventListener(
        "titleBarVisibilityChanged",
        handleTitleBarVisibilityChange,
      );
    };
  }, []);

  return { showTitleBar };
}
