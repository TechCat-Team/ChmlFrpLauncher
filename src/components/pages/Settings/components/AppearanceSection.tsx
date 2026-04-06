import { flushSync } from "react-dom";
import { Palette } from "lucide-react";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemSeparator,
} from "@/components/ui/item";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { ThemeMode, SidebarMode } from "../types";
import type { EffectType } from "../utils";
import { getBackgroundType } from "../utils";
import type { MutableRefObject } from "react";

interface AppearanceSectionProps {
  isMacOS: boolean;
  isWindows: boolean;
  followSystem: boolean;
  setFollowSystem: (value: boolean) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  isViewTransitionRef: MutableRefObject<boolean>;
  showTitleBar: boolean;
  setShowTitleBar: (value: boolean) => void;
  backgroundImage: string | null;
  isSelectingImage: boolean;
  overlayOpacity: number;
  setOverlayOpacity: (value: number) => void;
  blur: number;
  setBlur: (value: number) => void;
  effectType: EffectType;
  setEffectType: (value: EffectType) => void;
  videoStartSound: boolean;
  setVideoStartSound: (value: boolean) => void;
  videoVolume: number;
  setVideoVolume: (value: number) => void;
  sidebarMode: SidebarMode;
  setSidebarMode: (value: SidebarMode) => void;
  tunnelSoundEnabled: boolean;
  setTunnelSoundEnabled: (value: boolean) => void;
  onSelectBackgroundImage: () => void;
  onClearBackgroundImage: () => void;
}

export function AppearanceSection({
  isMacOS,
  isWindows,
  followSystem,
  setFollowSystem,
  theme,
  setTheme,
  isViewTransitionRef,
  showTitleBar,
  setShowTitleBar,
  backgroundImage,
  isSelectingImage,
  overlayOpacity,
  setOverlayOpacity,
  blur,
  setBlur,
  effectType,
  setEffectType,
  videoStartSound,
  setVideoStartSound,
  videoVolume,
  setVideoVolume,
  sidebarMode,
  setSidebarMode,
  tunnelSoundEnabled,
  setTunnelSoundEnabled,
  onSelectBackgroundImage,
  onClearBackgroundImage,
}: AppearanceSectionProps) {
  const backgroundType = getBackgroundType(backgroundImage);
  const isVideo = backgroundType === "video";

  const toggleTheme = async (newTheme: ThemeMode, event?: React.MouseEvent) => {
    if (!document.startViewTransition) {
      setTheme(newTheme);
      return;
    }

    const x = event?.clientX ?? window.innerWidth / 2;
    const y = event?.clientY ?? window.innerHeight / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    isViewTransitionRef.current = true;
    const transition = document.startViewTransition(() => {
      flushSync(() => {
        setTheme(newTheme);
      });
      const root = document.documentElement;
      if (newTheme === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    });

    await transition.ready;

    const clipPath = [
      `circle(0px at ${x}px ${y}px)`,
      `circle(${endRadius}px at ${x}px ${y}px)`,
    ];

    const animation = document.documentElement.animate(
      {
        clipPath: clipPath,
      },
      {
        duration: 500,
        easing: "ease-in",
        pseudoElement: "::view-transition-new(root)",
      },
    );

    animation.addEventListener("finish", () => {
      isViewTransitionRef.current = false;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Palette className="w-4 h-4" />
        <span>个性化</span>
      </div>
      <div className="rounded-lg bg-card overflow-hidden">
        <Item variant="outline" className="border-0">
          <ItemContent>
            <ItemTitle>跟随系统主题</ItemTitle>
            <ItemDescription className="text-xs">
              自动跟随系统主题设置
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <button
              onClick={() => setFollowSystem(!followSystem)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none outline-0 ${
                followSystem
                  ? "bg-foreground"
                  : "bg-muted dark:bg-foreground/12"
              } cursor-pointer`}
              role="switch"
              aria-checked={followSystem}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform ${
                  followSystem ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </ItemActions>
        </Item>

        {!followSystem ? (
          <>
            <ItemSeparator />
            <Item variant="outline" className="border-0">
              <ItemContent>
                <ItemTitle>主题</ItemTitle>
                <ItemDescription className="text-xs">
                  {theme === "dark" ? "深色模式" : "浅色模式"}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <button
                  onClick={(e) =>
                    toggleTheme(theme === "dark" ? "light" : "dark", e)
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none outline-0 ${
                    theme === "dark"
                      ? "bg-foreground"
                      : "bg-muted dark:bg-foreground/12"
                  } cursor-pointer`}
                  role="switch"
                  aria-checked={theme === "dark"}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform ${
                      theme === "dark" ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </ItemActions>
            </Item>
          </>
        ) : null}

        <ItemSeparator className="opacity-50" />

        <Item variant="outline" className="border-0">
          <ItemContent>
            <ItemTitle>侧边栏样式</ItemTitle>
            <ItemDescription className="text-xs">
              选择侧边栏的显示风格
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Select
              options={[
                { value: "classic", label: "经典 (默认)" },
                { value: "floating", label: "悬浮（展开）" },
                { value: "floating_fixed", label: "悬浮（固定）" },
              ]}
              value={sidebarMode}
              onChange={(value) => setSidebarMode(value as SidebarMode)}
              size="sm"
              className="w-32"
            />
          </ItemActions>
        </Item>

        {(isMacOS || isWindows) && sidebarMode === "classic" && (
          <>
            <ItemSeparator />
            <Item variant="outline" className="border-0">
              <ItemContent>
                <ItemTitle>显示顶部栏</ItemTitle>
                <ItemDescription className="text-xs">
                  {isMacOS
                    ? "显示顶部标题栏（关闭时，三色按钮将显示在侧边栏顶部）"
                    : "显示顶部标题栏（关闭时，窗口按钮将显示在右上角空白处）"}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <button
                  onClick={() => setShowTitleBar(!showTitleBar)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none outline-0 ${
                    showTitleBar
                      ? "bg-foreground"
                      : "bg-muted dark:bg-foreground/12"
                  } cursor-pointer`}
                  role="switch"
                  aria-checked={showTitleBar}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform ${
                      showTitleBar ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </ItemActions>
            </Item>
          </>
        )}

        <ItemSeparator />

        <Item variant="outline" className="border-0">
          <ItemContent>
            <ItemTitle>背景</ItemTitle>
            <ItemDescription className="text-xs">
              设置应用背景图片或视频
              {backgroundImage && (
                <span className="ml-1 text-muted-foreground">(已设置)</span>
              )}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <div className="flex gap-2">
              {!backgroundImage && (
                <Button
                  onClick={onSelectBackgroundImage}
                  disabled={isSelectingImage}
                  size="sm"
                  className={`h-auto px-3 py-1.5 text-xs ${
                    isSelectingImage
                      ? "bg-muted text-muted-foreground"
                      : "bg-foreground text-background hover:opacity-90"
                  }`}
                >
                  {isSelectingImage ? "选择中..." : "选择文件"}
                </Button>
              )}
              {backgroundImage && (
                <Button
                  onClick={onClearBackgroundImage}
                  size="sm"
                  className="h-auto px-3 py-1.5 text-xs"
                >
                  清除
                </Button>
              )}
            </div>
          </ItemActions>
        </Item>

        {backgroundImage && (
          <>
            <ItemSeparator />
            <Item variant="outline" className="border-0">
              <ItemContent>
                <ItemTitle>视觉效果</ItemTitle>
                <ItemDescription className="text-xs">
                  选择背景视觉效果类型
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Select
                  options={[
                    { value: "none", label: "无" },
                    { value: "frosted", label: "毛玻璃" },
                    { value: "translucent", label: "半透明" },
                  ]}
                  value={effectType}
                  onChange={(value) => {
                    const newEffectType = value as EffectType;
                    setEffectType(newEffectType);
                    localStorage.setItem("effectType", newEffectType);
                    window.dispatchEvent(new Event("effectTypeChanged"));
                  }}
                  placeholder="选择视觉效果"
                  size="sm"
                  className="w-28"
                />
              </ItemActions>
            </Item>

            <ItemSeparator />
            <Item variant="outline" className="border-0">
              <ItemContent>
                <ItemTitle>遮罩透明度</ItemTitle>
                <ItemDescription className="text-xs">
                  调整背景遮罩的透明度 ({overlayOpacity}%)
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <div className="flex items-center gap-3 w-48">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={overlayOpacity}
                    onChange={(e) =>
                      setOverlayOpacity(parseInt(e.target.value, 10))
                    }
                    className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-foreground"
                    style={{
                      background: `linear-gradient(to right, var(--foreground) 0%, var(--foreground) ${overlayOpacity}%, var(--muted) ${overlayOpacity}%, var(--muted) 100%)`,
                    }}
                  />
                  <span className="text-xs text-muted-foreground w-10 text-right">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={overlayOpacity}
                      onChange={(e) => {
                        const value = e.target.value;
                        let numValue = parseInt(value, 10);
                        
                        if (isNaN(numValue) || numValue < 0 || numValue > 100) {
                          numValue = 0;
                        }
                        
                        setOverlayOpacity(numValue);
                      }}
                      className="w-12 h-4 text-center text-xs text-foreground bg-muted rounded-md outline-none"
                    />
                  </span>
                </div>
              </ItemActions>
            </Item>

            <ItemSeparator />
            <Item variant="outline" className="border-0">
              <ItemContent>
                <ItemTitle>模糊度</ItemTitle>
                <ItemDescription className="text-xs">
                  调整背景的模糊效果 ({blur}px)
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <div className="flex items-center gap-3 w-48">
                  <input
                    type="range"
                    min="0"
                    max="20"
                    value={blur}
                    onChange={(e) => setBlur(parseInt(e.target.value, 10))}
                    className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-foreground"
                    style={{
                      background: `linear-gradient(to right, var(--foreground) 0%, var(--foreground) ${(blur / 20) * 100}%, var(--muted) ${(blur / 20) * 100}%, var(--muted) 100%)`,
                    }}
                  />
                  <span className="text-xs text-muted-foreground w-10 text-right">
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={blur}
                      onChange={(e) => {
                        const value = e.target.value;
                        let numValue = parseInt(value, 10);
                        
                        if (isNaN(numValue) || numValue < 0 || numValue > 20) {
                          numValue = 0;
                        }
                        
                        setBlur(numValue);
                      }}
                      className="w-12 h-4 text-center text-xs text-foreground bg-muted rounded-md outline-none"
                    />
                  </span>
                </div>
              </ItemActions>
            </Item>
          </>
        )}

        {isVideo && (
          <>
            <ItemSeparator />
            <Item variant="outline" className="border-0">
              <ItemContent>
                <ItemTitle>启动声音</ItemTitle>
                <ItemDescription className="text-xs">
                  在应用启动时播放视频声音（仅第一次循环）
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <button
                  onClick={() => {
                    const newValue = !videoStartSound;
                    setVideoStartSound(newValue);
                    localStorage.setItem(
                      "videoStartSound",
                      newValue.toString(),
                    );
                    window.dispatchEvent(new Event("videoStartSoundChanged"));
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none outline-0 ${
                    videoStartSound
                      ? "bg-foreground"
                      : "bg-muted dark:bg-foreground/12"
                  } cursor-pointer`}
                  role="switch"
                  aria-checked={videoStartSound}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform ${
                      videoStartSound ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </ItemActions>
            </Item>

            {videoStartSound && (
              <>
                <ItemSeparator />
                <Item variant="outline" className="border-0">
                  <ItemContent>
                    <ItemTitle>音量</ItemTitle>
                    <ItemDescription className="text-xs">
                      调整视频声音的音量 ({videoVolume}%)
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <div className="flex items-center gap-3 w-48">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={videoVolume}
                        onChange={(e) => {
                          const newValue = parseInt(e.target.value, 10);
                          setVideoVolume(newValue);
                          localStorage.setItem(
                            "videoVolume",
                            newValue.toString(),
                          );
                          window.dispatchEvent(new Event("videoVolumeChanged"));
                        }}
                        className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-foreground"
                        style={{
                          background: `linear-gradient(to right, var(--foreground) 0%, var(--foreground) ${videoVolume}%, var(--muted) ${videoVolume}%, var(--muted) 100%)`,
                        }}
                      />
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={videoVolume}
                          onChange={(e) => {
                            const value = e.target.value;
                            let numValue = parseInt(value, 10);
                            
                            if (isNaN(numValue) || numValue < 0 || numValue > 100) {
                              numValue = 0;
                            }
                            
                            setVideoVolume(numValue);
                            localStorage.setItem(
                              "videoVolume",
                              numValue.toString(),
                            );
                            window.dispatchEvent(new Event("videoVolumeChanged"));
                          }}
                          className="w-12 h-4 text-center text-xs text-foreground bg-muted rounded-md outline-none"
                        />
                      </span>
                    </div>
                  </ItemActions>
                </Item>
              </>
            )}
          </>
        )}

        <ItemSeparator />

        <Item variant="outline" className="border-0">
          <ItemContent>
            <ItemTitle>音效</ItemTitle>
            <ItemDescription className="text-xs">
              部分操作提示音（例如隧道启动成功的提示音）
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <button
              onClick={() => {
                const newValue = !tunnelSoundEnabled;
                setTunnelSoundEnabled(newValue);
                localStorage.setItem("tunnelSoundEnabled", newValue.toString());
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none outline-0 ${
                tunnelSoundEnabled
                  ? "bg-foreground"
                  : "bg-muted dark:bg-foreground/12"
              } cursor-pointer`}
              role="switch"
              aria-checked={tunnelSoundEnabled}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform ${
                  tunnelSoundEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </ItemActions>
        </Item>
      </div>
    </div>
  );
}
