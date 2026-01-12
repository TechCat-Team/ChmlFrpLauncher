import { useState, useEffect } from "react";
import type { ThemeMode } from "../types";
import {
  getInitialFollowSystem,
  getInitialTheme,
} from "../utils";

export function useTheme() {
  const [followSystem, setFollowSystem] = useState<boolean>(() =>
    getInitialFollowSystem(),
  );
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());

  useEffect(() => {
    localStorage.setItem("themeFollowSystem", followSystem.toString());
  }, [followSystem]);

  useEffect(() => {
    if (followSystem) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleSystemThemeChange = (e: MediaQueryListEvent) => {
        const newTheme = e.matches ? "dark" : "light";
        setTheme(newTheme);
      };

      const initialTheme = mediaQuery.matches ? "dark" : "light";
      setTheme(initialTheme);

      mediaQuery.addEventListener("change", handleSystemThemeChange);
      return () => {
        mediaQuery.removeEventListener("change", handleSystemThemeChange);
      };
    } else {
      const stored = localStorage.getItem("theme") as ThemeMode | null;
      if (stored === "light" || stored === "dark") {
        setTheme(stored);
      } else {
        const prefersDark = window.matchMedia(
          "(prefers-color-scheme: dark)",
        ).matches;
        setTheme(prefersDark ? "dark" : "light");
      }
    }
  }, [followSystem]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    if (!followSystem) {
      localStorage.setItem("theme", theme);
    }
    window.dispatchEvent(new Event("themeChanged"));
  }, [theme, followSystem]);

  return {
    followSystem,
    setFollowSystem,
    theme,
    setTheme,
  };
}

