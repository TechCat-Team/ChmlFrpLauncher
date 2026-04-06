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
      } catch (error) {
        console.error("Failed to initialize process guard:", error);
      }
    };

    const initIpv6OnlyNetwork = async () => {
      if (typeof window === "undefined") return;
      if (localStorage.getItem("ipv6OnlyNetwork") !== null) return;
      if (!("__TAURI__" in window)) {
        localStorage.setItem("ipv6OnlyNetwork", "false");
        window.dispatchEvent(new Event("ipv6OnlyNetworkChanged"));
        return;
      }

      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const ipv4Result = await invoke<{ success: boolean }>("ping_host", {
          host: "1.1.1.1",
        });
        const ipv6Result = await invoke<{ success: boolean }>("ping_host", {
          host: "2606:4700:4700::1111",
        });
        const ipv6Only = ipv6Result.success && !ipv4Result.success;
        localStorage.setItem("ipv6OnlyNetwork", ipv6Only ? "true" : "false");
        window.dispatchEvent(new Event("ipv6OnlyNetworkChanged"));
      } catch {
        localStorage.setItem("ipv6OnlyNetwork", "false");
        window.dispatchEvent(new Event("ipv6OnlyNetworkChanged"));
      }
    };

    initProcessGuard();
    initIpv6OnlyNetwork();
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
