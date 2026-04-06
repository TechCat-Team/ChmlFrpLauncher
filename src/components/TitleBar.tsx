import { useState, useEffect } from "react";
import { Minus, Square, X, Pin } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "@/lib/utils";
import {
  getInitialEffectType,
  type EffectType,
} from "@/components/pages/Settings/utils";

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
  const [effectType, setEffectType] = useState<EffectType>(() =>
    getInitialEffectType(),
  );
  const isMacOS =
    typeof navigator !== "undefined" &&
    navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  useEffect(() => {
    let mounted = true;
    let unlistenFn: (() => void) | null = null;

    const initWindow = async () => {
      try {
        const appWindow = getCurrentWindow();

        if (isMacOS) {
          try {
            await appWindow.setTitle("");
          } catch (error) {
            console.error("Failed to set window title:", error);
          }
        }

        const maximized = await appWindow.isMaximized();
        if (mounted) {
          setIsMaximized(maximized);
        }

        const unlisten = await appWindow.onResized(async () => {
          if (mounted) {
            const maximized = await appWindow.isMaximized();
            setIsMaximized(maximized);
          }
        });

        return unlisten;
      } catch (error) {
        console.error("Failed to initialize window:", error);
        return null;
      }
    };

    initWindow().then((unlisten) => {
      unlistenFn = unlisten || null;
    });

    return () => {
      mounted = false;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [isMacOS]);

  useEffect(() => {
    const handleEffectTypeChange = () => {
      setEffectType(getInitialEffectType());
    };

    window.addEventListener("effectTypeChanged", handleEffectTypeChange);
    return () => {
      window.removeEventListener("effectTypeChanged", handleEffectTypeChange);
    };
  }, []);

  const toggleAlwaysOnTop = async () => {
    try {
      const appWindow = getCurrentWindow();
      const newState = !isAlwaysOnTop;
      await appWindow.setAlwaysOnTop(newState);
      setIsAlwaysOnTop(newState);
    } catch (error) {
      console.error("Failed to toggle always on top:", error);
    }
  };

  const isFrosted = effectType === "frosted";

  return (
    <div
      data-tauri-drag-region
      className={cn(
        "h-9 flex items-center select-none bg-card",
        isFrosted && "backdrop-blur-md",
        "transition-colors duration-200",
        isMacOS && "pl-20",
      )}
    >
      <div
        data-tauri-drag-region
        className={cn(
          "flex items-center gap-2.5 flex-1 min-w-0 cursor-default",
          isMacOS ? "px-3" : "px-4",
        )}
      ></div>

      {!isMacOS ? (
        <div className="flex items-center gap-1 pr-1">
          <button
            onClick={toggleAlwaysOnTop}
            onMouseDown={(e) => e.stopPropagation()}
            className={cn(
              "h-6 px-2 rounded-md flex items-center justify-center gap-1 transition-all duration-200",
              isAlwaysOnTop
                ? "bg-primary/20 text-primary"
                : "text-foreground/30 hover:text-foreground/70 hover:bg-foreground/5",
              "dark:text-foreground/40 dark:hover:text-foreground/80 dark:hover:bg-foreground/7",
              "active:scale-95 active:opacity-70",
              "cursor-pointer text-xs font-medium",
            )}
            aria-label={isAlwaysOnTop ? "取消置顶" : "置顶窗口"}
            title={isAlwaysOnTop ? "取消置顶" : "置顶窗口"}
          >
            <Pin className={cn("h-3 w-3", isAlwaysOnTop && "rotate-45")} strokeWidth={2.5} />
            <span className="hidden sm:inline">{isAlwaysOnTop ? "已置顶" : "置顶"}</span>
          </button>
          <WindowControlButtons isMaximized={isMaximized} />
        </div>
      ) : (
        <div className="flex items-center gap-1 w-20 flex-shrink-0 justify-end pr-3">
          <button
            onClick={toggleAlwaysOnTop}
            onMouseDown={(e) => e.stopPropagation()}
            className={cn(
              "h-6 px-2 rounded-md flex items-center justify-center gap-1 transition-all duration-200",
              isAlwaysOnTop
                ? "bg-primary/20 text-primary"
                : "text-foreground/30 hover:text-foreground/70 hover:bg-foreground/5",
              "dark:text-foreground/40 dark:hover:text-foreground/80 dark:hover:bg-foreground/7",
              "active:scale-95 active:opacity-70",
              "cursor-pointer text-xs font-medium",
            )}
            aria-label={isAlwaysOnTop ? "取消置顶" : "置顶窗口"}
            title={isAlwaysOnTop ? "取消置顶" : "置顶窗口"}
          >
            <Pin className={cn("h-3 w-3", isAlwaysOnTop && "rotate-45")} strokeWidth={2.5} />
          </button>
        </div>
      )}
    </div>
  );
}

type WindowControlButtonsProps = {
  isMaximized: boolean;
  className?: string;
};

function WindowControlButtons({
  isMaximized,
  className,
}: WindowControlButtonsProps) {
  return (
    <div
      className={cn("flex items-center gap-0.5 flex-shrink-0", className)}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        onClick={async () => {
          try {
            const appWindow = getCurrentWindow();
            await appWindow.minimize();
          } catch (error) {
            console.error("Failed to minimize window:", error);
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          "h-6 w-7 rounded-md flex items-center justify-center transition-all duration-200",
          "text-foreground/30 hover:text-foreground/70 hover:bg-foreground/5",
          "dark:text-foreground/40 dark:hover:text-foreground/80 dark:hover:bg-foreground/7",
          "active:scale-95 active:opacity-70",
          "cursor-pointer",
        )}
        aria-label="最小化"
      >
        <Minus className="h-3 w-3" strokeWidth={2.5} />
      </button>
      <button
        onClick={async () => {
          try {
            const appWindow = getCurrentWindow();
            if (isMaximized) {
              await appWindow.unmaximize();
            } else {
              await appWindow.maximize();
            }
          } catch (error) {
            console.error("Failed to toggle maximize:", error);
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          "h-6 w-7 rounded-md flex items-center justify-center transition-all duration-200",
          "text-foreground/30 hover:text-foreground/70 hover:bg-foreground/5",
          "dark:text-foreground/40 dark:hover:text-foreground/80 dark:hover:bg-foreground/7",
          "active:scale-95 active:opacity-70",
          "cursor-pointer",
        )}
        aria-label={isMaximized ? "还原" : "最大化"}
      >
        <Square className="h-2.5 w-2.5" strokeWidth={2.5} />
      </button>
      <button
        onClick={async () => {
          try {
            const appWindow = getCurrentWindow();
            await appWindow.close();
          } catch (error) {
            console.error("Failed to close window:", error);
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          "h-6 w-7 rounded-md flex items-center justify-center transition-all duration-200",
          "text-foreground/30 hover:text-foreground hover:bg-destructive/10 hover:text-destructive",
          "dark:text-foreground/40 dark:hover:text-destructive dark:hover:bg-destructive/15",
          "active:scale-95 active:opacity-70",
          "cursor-pointer",
        )}
        aria-label="关闭"
      >
        <X className="h-3 w-3" strokeWidth={2.5} />
      </button>
    </div>
  );
}

export function WindowControls({ className }: { className?: string }) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let mounted = true;
    let unlistenFn: (() => void) | null = null;

    const initWindow = async () => {
      try {
        const appWindow = getCurrentWindow();
        const maximized = await appWindow.isMaximized();
        if (mounted) {
          setIsMaximized(maximized);
        }

        const unlisten = await appWindow.onResized(async () => {
          if (mounted) {
            const maximized = await appWindow.isMaximized();
            setIsMaximized(maximized);
          }
        });

        return unlisten;
      } catch (error) {
        console.error("Failed to initialize window:", error);
        return null;
      }
    };

    initWindow().then((unlisten) => {
      unlistenFn = unlisten || null;
    });

    return () => {
      mounted = false;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  return <WindowControlButtons isMaximized={isMaximized} className={className} />;
}
