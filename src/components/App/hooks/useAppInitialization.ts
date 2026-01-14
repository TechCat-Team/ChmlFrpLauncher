import { useEffect } from "react";
import { logStore } from "@/services/logStore";

/**
 * 应用初始化逻辑 hook
 * 处理日志监听、进程守护等初始化工作
 */
export function useAppInitialization() {
  useEffect(() => {
    logStore.startListening();

    const initProcessGuard = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const guardEnabled =
          localStorage.getItem("processGuardEnabled") === "true";
        await invoke("set_process_guard_enabled", { enabled: guardEnabled });
        console.log(`[守护进程] 初始化状态: ${guardEnabled ? "启用" : "禁用"}`);
      } catch (error) {
        console.error("Failed to initialize process guard:", error);
      }
    };

    initProcessGuard();
  }, []);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);
}
