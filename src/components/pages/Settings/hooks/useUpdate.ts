import { useState, useEffect } from "react";
import { toast } from "sonner";
import { updateService, type UpdateInfo } from "@/services/updateService";

export function useUpdate() {
  const [autoCheckUpdate, setAutoCheckUpdate] = useState(() =>
    updateService.getAutoCheckEnabled(),
  );
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string>("");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    const loadVersion = async () => {
      try {
        const version = await updateService.getCurrentVersion();
        setCurrentVersion(version);
      } catch (error) {
        console.error("获取版本失败:", error);
      }
    };
    loadVersion();
  }, []);

  const handleCheckUpdate = async () => {
    if (checkingUpdate) return;

    setCheckingUpdate(true);
    const toastId = toast.loading("正在检查更新...", { duration: Infinity });

    try {
      const result = await updateService.checkUpdate();

      if (result.available) {
        toast.dismiss(toastId);
        setUpdateInfo({
          version: result.version || "",
          date: result.date,
          body: result.body,
        });
      } else {
        toast.success("当前已是最新版本", {
          id: toastId,
          duration: 3000,
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(`检查更新失败: ${errorMsg}`, {
        id: toastId,
        duration: 5000,
      });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleToggleAutoCheckUpdate = (enabled: boolean) => {
    updateService.setAutoCheckEnabled(enabled);
    setAutoCheckUpdate(enabled);
    toast.success(
      enabled ? "已启用启动时自动检测更新" : "已禁用启动时自动检测更新",
      {
        duration: 2000,
      },
    );
  };

  return {
    autoCheckUpdate,
    checkingUpdate,
    currentVersion,
    updateInfo,
    setUpdateInfo,
    handleCheckUpdate,
    handleToggleAutoCheckUpdate,
  };
}
