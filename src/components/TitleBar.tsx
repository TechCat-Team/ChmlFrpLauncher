import { useState, useEffect } from "react";
import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "@/lib/utils";

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const isMacOS = typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;

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


  return (
    <div
      data-tauri-drag-region
      className={cn(
        "h-9 flex items-center select-none border-b",
        "bg-sidebar/30 dark:bg-sidebar/40 backdrop-blur-md",
        "border-sidebar-border/20 dark:border-sidebar-border/25",
        "transition-colors duration-200",
        isMacOS && "pl-20"
      )}
    >
      <div
        data-tauri-drag-region
        className={cn(
          "flex items-center gap-2.5 flex-1 min-w-0 cursor-default",
          isMacOS ? "px-3" : "px-4"
        )}
      >
      </div>

      {!isMacOS ? (
        <div 
          className="flex items-center gap-0.5 flex-shrink-0 pr-2"
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
              "cursor-pointer"
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
              "cursor-pointer"
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
              "cursor-pointer"
            )}
            aria-label="关闭"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
          </button>
        </div>
      ) : (
        <div className="w-16 flex-shrink-0" />
      )}
    </div>
  );
}

