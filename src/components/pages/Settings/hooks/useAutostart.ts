import { useState, useEffect } from "react";
import { toast } from "sonner";
import { autostartService } from "@/services/autostartService";

export function useAutostart() {
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [autostartLoading, setAutostartLoading] = useState(false);

  useEffect(() => {
    const checkAutostart = async () => {
      try {
        const enabled = await autostartService.isEnabled();
        setAutostartEnabled(enabled);
      } catch (error) {
        console.error("检查开机自启状态失败:", error);
      }
    };
    checkAutostart();
  }, []);

  const handleToggleAutostart = async (enabled: boolean) => {
    if (autostartLoading) return;

    setAutostartLoading(true);
    try {
      await autostartService.setEnabled(enabled);
      setAutostartEnabled(enabled);
      toast.success(enabled ? "已启用开机自启" : "已禁用开机自启", {
        duration: 2000,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(`设置失败: ${errorMsg}`, {
        duration: 3000,
      });
    } finally {
      setAutostartLoading(false);
    }
  };

  return {
    autostartEnabled,
    autostartLoading,
    handleToggleAutostart,
  };
}
