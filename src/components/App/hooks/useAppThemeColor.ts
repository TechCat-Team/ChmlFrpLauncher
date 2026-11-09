import { useEffect } from "react";
import {
  applyThemeColor,
  getInitialThemeColor,
} from "@/components/pages/Settings/utils";

/**
 * App 级别的主题色管理 hook
 * 处理应用启动时的主题色初始化，并响应主题色变化事件
 */
export function useAppThemeColor() {
  useEffect(() => {
    const applyStoredThemeColor = () => {
      applyThemeColor(getInitialThemeColor());
    };

    applyStoredThemeColor();

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "themeColor") {
        applyStoredThemeColor();
      }
    };

    window.addEventListener("themeColorChanged", applyStoredThemeColor);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("themeColorChanged", applyStoredThemeColor);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);
}
