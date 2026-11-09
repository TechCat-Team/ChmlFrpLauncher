import { useCallback, useState } from "react";
import type { ThemeColor } from "../types";
import {
  applyThemeColor,
  getInitialThemeColor,
  normalizeThemeColor,
} from "../utils";

/**
 * 软件主题色管理 hook
 * 负责状态、持久化，以及将主题色应用到根节点
 */
export function useThemeColor() {
  const [themeColor, setThemeColorState] = useState<ThemeColor>(() =>
    getInitialThemeColor(),
  );

  const commitThemeColor = useCallback((color: ThemeColor) => {
    setThemeColorState(color);
    if (color) {
      localStorage.setItem("themeColor", color);
    } else {
      localStorage.removeItem("themeColor");
    }
    applyThemeColor(color);
    window.dispatchEvent(new Event("themeColorChanged"));
  }, []);

  const setThemeColor = useCallback(
    (color: string) => {
      const normalized = normalizeThemeColor(color);
      if (!normalized) return;
      commitThemeColor(normalized);
    },
    [commitThemeColor],
  );

  const resetThemeColor = useCallback(
    () => commitThemeColor(null),
    [commitThemeColor],
  );

  return { themeColor, setThemeColor, resetThemeColor };
}
