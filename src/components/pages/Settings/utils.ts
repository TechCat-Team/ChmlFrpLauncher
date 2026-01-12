import type { ThemeMode } from "./types";

export const getInitialFollowSystem = (): boolean => {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem("themeFollowSystem");
  return stored !== "false";
};

export const getInitialTheme = (): ThemeMode => {
  if (typeof window === "undefined") return "light";
  const followSystem = getInitialFollowSystem();
  if (followSystem) {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    return prefersDark ? "dark" : "light";
  }
  const stored = localStorage.getItem("theme") as ThemeMode | null;
  if (stored === "light" || stored === "dark") return stored;
  return "light";
};

export const getInitialBackgroundImage = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("backgroundImage");
};

export const getInitialBackgroundOverlayOpacity = (): number => {
  if (typeof window === "undefined") return 80;
  const stored = localStorage.getItem("backgroundOverlayOpacity");
  return stored ? parseInt(stored, 10) : 80;
};

export const getInitialBackgroundBlur = (): number => {
  if (typeof window === "undefined") return 4;
  const stored = localStorage.getItem("backgroundBlur");
  return stored ? parseInt(stored, 10) : 4;
};

export const getInitialBypassProxy = (): boolean => {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem("bypassProxy");
  return stored !== "false";
};

export const getInitialShowTitleBar = (): boolean => {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem("showTitleBar");
  // 如果从未设置过，默认返回 false（关闭）
  if (stored === null) return false;
  return stored === "true";
};

export const getMimeType = (filePath: string): string => {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
  };
  return mimeTypes[ext || ""] || "image/png";
};

