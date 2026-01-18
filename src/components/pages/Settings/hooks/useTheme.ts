import { useState, useEffect, useRef } from "react";
import type { ThemeMode } from "../types";
import { getInitialFollowSystem, getInitialTheme } from "../utils";

export function useTheme() {
  const [followSystem, setFollowSystem] = useState<boolean>(() =>
    getInitialFollowSystem(),
  );
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const prevFollowSystemRef = useRef(followSystem);
  const isViewTransitionRef = useRef(false);

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

      if (prevFollowSystemRef.current !== followSystem) {
        const initialTheme = mediaQuery.matches ? "dark" : "light";
        requestAnimationFrame(() => {
          setTheme(initialTheme);
        });
      }

      prevFollowSystemRef.current = followSystem;

      mediaQuery.addEventListener("change", handleSystemThemeChange);
      return () => {
        mediaQuery.removeEventListener("change", handleSystemThemeChange);
      };
    } else {
      if (prevFollowSystemRef.current !== followSystem) {
        const stored = localStorage.getItem("theme") as ThemeMode | null;
        if (stored === "light" || stored === "dark") {
          requestAnimationFrame(() => {
            setTheme(stored);
          });
        } else {
          const prefersDark = window.matchMedia(
            "(prefers-color-scheme: dark)",
          ).matches;
          const newTheme = prefersDark ? "dark" : "light";
          requestAnimationFrame(() => {
            setTheme(newTheme);
          });
        }
      }
      prevFollowSystemRef.current = followSystem;
    }
  }, [followSystem]);

  useEffect(() => {
    if (isViewTransitionRef.current) {
      if (!followSystem) {
        localStorage.setItem("theme", theme);
      }
      window.dispatchEvent(new Event("themeChanged"));
      return;
    }

    const root = document.documentElement;
    const hasDarkClass = root.classList.contains("dark");
    const shouldBeDark = theme === "dark";

    if (shouldBeDark && !hasDarkClass) {
      root.classList.add("dark");
    } else if (!shouldBeDark && hasDarkClass) {
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
    isViewTransitionRef,
  };
}
