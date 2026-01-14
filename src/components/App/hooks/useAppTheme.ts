import { useState, useEffect } from "react";

/**
 * App 级别的主题管理 hook
 * 处理主题的初始化和 DOM 更新
 */
export function useAppTheme() {
  const getInitialTheme = (): string => {
    if (typeof window === "undefined") return "light";
    const followSystem = localStorage.getItem("themeFollowSystem") !== "false";
    let initialTheme: string;
    if (followSystem) {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      initialTheme = prefersDark ? "dark" : "light";
    } else {
      initialTheme = localStorage.getItem("theme") || "light";
    }

    const root = document.documentElement;
    if (initialTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    return initialTheme;
  };

  const [theme, setTheme] = useState<string>(() => getInitialTheme());

  useEffect(() => {
    const applyThemeToDOM = (themeValue: string) => {
      const root = document.documentElement;
      if (themeValue === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    };

    applyThemeToDOM(theme);
  }, [theme]);

  useEffect(() => {
    const handleThemeChange = () => {
      const followSystem =
        localStorage.getItem("themeFollowSystem") !== "false";
      if (followSystem) {
        const prefersDark = window.matchMedia(
          "(prefers-color-scheme: dark)",
        ).matches;
        setTheme(prefersDark ? "dark" : "light");
      } else {
        const currentTheme = localStorage.getItem("theme") || "light";
        setTheme(currentTheme);
      }
    };

    window.addEventListener("storage", (e) => {
      if (e.key === "theme" || e.key === "themeFollowSystem") {
        handleThemeChange();
      }
    });

    const handleThemeChanged = () => {
      handleThemeChange();
    };
    window.addEventListener("themeChanged", handleThemeChanged);

    const followSystem = localStorage.getItem("themeFollowSystem") !== "false";
    if (followSystem) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleSystemThemeChange = (e: MediaQueryListEvent) => {
        setTheme(e.matches ? "dark" : "light");
      };

      mediaQuery.addEventListener("change", handleSystemThemeChange);

      return () => {
        window.removeEventListener("themeChanged", handleThemeChanged);
        mediaQuery.removeEventListener("change", handleSystemThemeChange);
      };
    }

    return () => {
      window.removeEventListener("themeChanged", handleThemeChanged);
    };
  }, []);

  return { theme };
}
