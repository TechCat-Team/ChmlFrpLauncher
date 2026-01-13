import { Palette } from "lucide-react";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@/components/ui/item";
import type { ThemeMode } from "../types";

interface AppearanceSectionProps {
  isMacOS: boolean;
  followSystem: boolean;
  setFollowSystem: (value: boolean) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  showTitleBar: boolean;
  setShowTitleBar: (value: boolean) => void;
  backgroundImage: string | null;
  isSelectingImage: boolean;
  overlayOpacity: number;
  setOverlayOpacity: (value: number) => void;
  blur: number;
  setBlur: (value: number) => void;
  frostedGlassEnabled: boolean;
  setFrostedGlassEnabled: (value: boolean) => void;
  onSelectBackgroundImage: () => void;
  onClearBackgroundImage: () => void;
}

export function AppearanceSection({
  isMacOS,
  followSystem,
  setFollowSystem,
  theme,
  setTheme,
  showTitleBar,
  setShowTitleBar,
  backgroundImage,
  isSelectingImage,
  overlayOpacity,
  setOverlayOpacity,
  blur,
  setBlur,
  frostedGlassEnabled,
  setFrostedGlassEnabled,
  onSelectBackgroundImage,
  onClearBackgroundImage,
}: AppearanceSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Palette className="w-4 h-4" />
        <span>外观</span>
      </div>
      <div className="border border-border/60 rounded-lg bg-card overflow-hidden">
        <Item
          variant="outline"
          className="border-0 border-b border-border/60 last:border-0"
        >
          <ItemContent>
            <ItemTitle>跟随系统主题</ItemTitle>
            <ItemDescription className="text-xs">
              自动跟随系统主题设置
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <button
              onClick={() => setFollowSystem(!followSystem)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                followSystem ? "bg-foreground" : "bg-muted"
              } cursor-pointer`}
              role="switch"
              aria-checked={followSystem}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                  followSystem ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </ItemActions>
        </Item>

        {!followSystem && (
          <Item
            variant="outline"
            className="border-0 border-b border-border/60 last:border-0"
          >
            <ItemContent>
              <ItemTitle>主题</ItemTitle>
              <ItemDescription className="text-xs">
                选择界面配色方案
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <div className="flex gap-2">
                <button
                  onClick={() => setTheme("light")}
                  className={`px-3 py-1.5 text-xs rounded transition-colors ${
                    theme === "light"
                      ? "bg-foreground text-background"
                      : "border border-border/60 hover:bg-muted/40"
                  }`}
                >
                  浅色
                </button>
                <button
                  onClick={() => setTheme("dark")}
                  className={`px-3 py-1.5 text-xs rounded transition-colors ${
                    theme === "dark"
                      ? "bg-foreground text-background"
                      : "border border-border/60 hover:bg-muted/40"
                  }`}
                >
                  深色
                </button>
              </div>
            </ItemActions>
          </Item>
        )}

        {/* 只在 macOS 上显示顶部栏开关 */}
        {isMacOS && (
          <Item
            variant="outline"
            className="border-0 border-b border-border/60"
          >
            <ItemContent>
              <ItemTitle>显示顶部栏</ItemTitle>
              <ItemDescription className="text-xs">
                显示顶部标题栏（关闭时，三色按钮将显示在侧边栏顶部）
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <button
                onClick={() => setShowTitleBar(!showTitleBar)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  showTitleBar ? "bg-foreground" : "bg-muted"
                } cursor-pointer`}
                role="switch"
                aria-checked={showTitleBar}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                    showTitleBar ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </ItemActions>
          </Item>
        )}

        <Item variant="outline" className="border-0">
          <ItemContent>
            <ItemTitle>背景图</ItemTitle>
            <ItemDescription className="text-xs">
              设置应用背景图片
              {backgroundImage && (
                <span className="ml-1 text-muted-foreground">(已设置)</span>
              )}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <div className="flex gap-2">
              <button
                onClick={onSelectBackgroundImage}
                disabled={isSelectingImage}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  isSelectingImage
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-foreground text-background hover:opacity-90"
                }`}
              >
                {isSelectingImage ? "选择中..." : "选择图片"}
              </button>
              {backgroundImage && (
                <button
                  onClick={onClearBackgroundImage}
                  className="px-3 py-1.5 text-xs rounded transition-colors border border-border/60 hover:bg-muted/40"
                >
                  清除
                </button>
              )}
            </div>
          </ItemActions>
        </Item>

        {backgroundImage && (
          <>
            <Item
              variant="outline"
              className="border-0 border-t border-border/60"
            >
              <ItemContent>
                <ItemTitle>毛玻璃效果</ItemTitle>
                <ItemDescription className="text-xs">
                  为所有元素应用毛玻璃透明效果
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <button
                  onClick={() => {
                    const newValue = !frostedGlassEnabled;
                    setFrostedGlassEnabled(newValue);
                    localStorage.setItem("frostedGlassEnabled", newValue.toString());
                    window.dispatchEvent(new Event("frostedGlassChanged"));
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    frostedGlassEnabled ? "bg-foreground" : "bg-muted"
                  } cursor-pointer`}
                  role="switch"
                  aria-checked={frostedGlassEnabled}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                      frostedGlassEnabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </ItemActions>
            </Item>

            <Item
              variant="outline"
              className="border-0 border-t border-border/60"
            >
              <ItemContent>
                <ItemTitle>遮罩透明度</ItemTitle>
                <ItemDescription className="text-xs">
                  调整背景图遮罩的透明度 ({overlayOpacity}%)
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
                    {overlayOpacity}%
                  </span>
                </div>
              </ItemActions>
            </Item>

            <Item variant="outline" className="border-0">
              <ItemContent>
                <ItemTitle>模糊度</ItemTitle>
                <ItemDescription className="text-xs">
                  调整背景图的模糊效果 ({blur}px)
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
                    {blur}px
                  </span>
                </div>
              </ItemActions>
            </Item>
          </>
        )}
      </div>
    </div>
  );
}

