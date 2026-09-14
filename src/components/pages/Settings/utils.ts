import type { ThemeMode, SidebarMode, ThemeColor } from "./types";

export type { ThemeMode, SidebarMode, ThemeColor };

/** 取色器的初始值（默认主题色） */
export const DEFAULT_THEME_COLOR = "#0b0d11";

interface Hsl {
  h: number;
  s: number;
  l: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** 将 #rgb / #rrggbb 规范化为小写 #rrggbb，非法输入返回 null */
export const normalizeThemeColor = (input: string): string | null => {
  let hex = input.trim();
  if (!hex.startsWith("#")) hex = `#${hex}`;
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return hex.toLowerCase();
};

const hexToHsl = (hex: string): Hsl => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l: l * 100 };

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h: number;
  if (max === r) h = (g - b) / delta + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  return { h: h * 60, s: s * 100, l: l * 100 };
};

const hslToHex = ({ h, s, l }: Hsl): string => {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  const toHex = (value: number) =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
};

/** 根据用户选择的颜色推导浅色 / 深色两套主题色变量 */
const buildThemeColorVars = (color: string) => {
  const { h, s, l } = hexToHsl(color);
  // 低饱和度视为灰阶，保持原样，避免被强制染色
  const saturation = s <= 12 ? s : clamp(s, 30, 100);

  const lightPrimary = hslToHex({ h, s: saturation, l: clamp(l, 28, 48) });
  const darkPrimary = hslToHex({ h, s: saturation, l: clamp(l, 60, 82) });

  const toVars = (primary: string, foreground: string) =>
    `--primary:${primary};--primary-foreground:${foreground};--ring:${primary};--sidebar-primary:${primary};--sidebar-primary-foreground:${foreground};--sidebar-ring:${primary};`;

  return {
    light: toVars(lightPrimary, "#ffffff"),
    dark: toVars(darkPrimary, "#0a0b0d"),
  };
};

const THEME_COLOR_STYLE_ID = "theme-color-overrides";

export const getInitialThemeColor = (): ThemeColor => {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem("themeColor");
  return stored ? normalizeThemeColor(stored) : null;
};

/** 应用自定义主题色（同时注入浅色/深色两套变量），传入 null 时恢复默认 */
export const applyThemeColor = (color: ThemeColor): void => {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(THEME_COLOR_STYLE_ID);

  if (!color) {
    existing?.remove();
    return;
  }

  const { light, dark } = buildThemeColorVars(color);
  // 使用更高特异度的选择器，确保不受样式表插入顺序影响
  const css = `html:root{${light}}\nhtml.dark:root{${dark}}`;

  if (existing) {
    existing.textContent = css;
    return;
  }

  const style = document.createElement("style");
  style.id = THEME_COLOR_STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
};

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

export type FrpcLogLevel = "trace" | "debug" | "info" | "warn" | "error";

export const getInitialFrpcLogLevel = (): FrpcLogLevel => {
  if (typeof window === "undefined") return "info";
  const stored = localStorage.getItem("frpcLogLevel");
  if (
    stored === "trace" ||
    stored === "debug" ||
    stored === "info" ||
    stored === "warn" ||
    stored === "error"
  ) {
    return stored;
  }
  return "info";
};

export const getInitialShowTitleBar = (): boolean => {
  if (typeof window === "undefined") return false;
  const isMacOS = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const stored = localStorage.getItem("showTitleBar");
  if (stored === null) return !isMacOS;
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

export const getInitialSidebarMode = (): SidebarMode => {
  if (typeof window === "undefined") return "classic";
  const stored = localStorage.getItem("sidebarMode") as SidebarMode | null;
  if (
    stored === "classic" ||
    stored === "floating" ||
    stored === "floating_fixed"
  )
    return stored;
  return "classic";
};

export const getInitialTunnelSoundEnabled = (): boolean => {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem("tunnelSoundEnabled");
  return stored !== "false";
};

export const getInitialRestartOnEdit = (): boolean => {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem("restartOnEdit");
  return stored === "true";
};
