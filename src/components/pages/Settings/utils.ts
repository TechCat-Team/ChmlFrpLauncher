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
  if (stored === null) return false;
  return stored === "true";
};

export const getInitialTranslucentEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem("translucentEnabled");
  return stored === "true";
};

export type EffectType = "frosted" | "translucent" | "none";

export const getInitialEffectType = (): EffectType => {
  if (typeof window === "undefined") return "none";
  const stored = localStorage.getItem("effectType");
  if (stored === "frosted" || stored === "translucent" || stored === "none") {
    return stored;
  }
  const frostedEnabled = localStorage.getItem("frostedGlassEnabled") === "true";
  const translucentEnabled =
    localStorage.getItem("translucentEnabled") === "true";
  if (frostedEnabled) return "frosted";
  if (translucentEnabled) return "translucent";
  return "none";
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
    mp4: "video/mp4",
    webm: "video/webm",
    ogv: "video/ogg",
    mov: "video/quicktime",
  };
  return mimeTypes[ext || ""] || "image/png";
};

export const isVideoFile = (filePath: string): boolean => {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const videoExts = ["mp4", "webm", "ogv", "mov"];
  return videoExts.includes(ext || "");
};

export const isVideoMimeType = (mimeType: string): boolean => {
  return mimeType.startsWith("video/");
};

export const getBackgroundType = (
  dataUrl: string | null,
): "image" | "video" | null => {
  if (!dataUrl) return null;
  if (dataUrl.startsWith("data:video/")) return "video";
  if (dataUrl.startsWith("data:image/")) return "image";
  if (dataUrl.startsWith("app://") || dataUrl.startsWith("file://")) {
    const ext = dataUrl.split(".").pop()?.toLowerCase();
    const videoExts = ["mp4", "webm", "ogv", "mov"];
    if (ext && videoExts.includes(ext)) return "video";
  }
  return "image";
};

export const getInitialVideoStartSound = (): boolean => {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem("videoStartSound");
  return stored === "true";
};

export const getInitialVideoVolume = (): number => {
  if (typeof window === "undefined") return 50;
  const stored = localStorage.getItem("videoVolume");
  return stored ? parseInt(stored, 10) : 50;
};
