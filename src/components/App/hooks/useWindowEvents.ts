import { useState, useEffect } from "react";

/**
 * 窗口事件处理 hook
 * 处理窗口关闭、最小化到托盘等事件
 */
export function useWindowEvents() {
  const [showCloseConfirmDialog, setShowCloseConfirmDialog] = useState(false);

  useEffect(() => {
    const handleShowCloseConfirmDialog = () => {
      setShowCloseConfirmDialog(true);
    };

    const handleMinimizeToTray = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("hide_window");
      } catch (error) {
        console.error("Failed to minimize to tray:", error);
      }
    };

    const handleCloseApp = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("quit_app");
      } catch (error) {
        console.error("Failed to close app:", error);
      }
    };

    window.addEventListener(
      "showCloseConfirmDialog",
      handleShowCloseConfirmDialog,
    );
    window.addEventListener("minimizeToTray", handleMinimizeToTray);
    window.addEventListener("closeApp", handleCloseApp);

    return () => {
      window.removeEventListener(
        "showCloseConfirmDialog",
        handleShowCloseConfirmDialog,
      );
      window.removeEventListener("minimizeToTray", handleMinimizeToTray);
      window.removeEventListener("closeApp", handleCloseApp);
    };
  }, []);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    const setupWindowCloseListener = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const { invoke } = await import("@tauri-apps/api/core");
        const appWindow = getCurrentWindow();

        const unlisten = await appWindow.listen(
          "window-close-requested",
          async () => {
            const closeBehavior =
              localStorage.getItem("closeBehavior") || "ask";

            if (closeBehavior === "ask") {
              setShowCloseConfirmDialog(true);
            } else if (closeBehavior === "minimize_to_tray") {
              try {
                await invoke("hide_window");
              } catch (error) {
                console.error("Failed to hide window:", error);
              }
            } else {
              try {
                await invoke("quit_app");
              } catch (error) {
                console.error("Failed to quit app:", error);
              }
            }
          },
        );

        unlistenFn = unlisten;
      } catch (error) {
        console.error("Failed to setup window close listener:", error);
      }
    };

    setupWindowCloseListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  return {
    showCloseConfirmDialog,
    setShowCloseConfirmDialog,
  };
}
