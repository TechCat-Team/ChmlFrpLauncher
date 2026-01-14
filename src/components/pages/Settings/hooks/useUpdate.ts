import { useState, useEffect } from "react";
import { toast } from "sonner";
import { updateService } from "@/services/updateService";

export function useUpdate() {
  const [autoCheckUpdate, setAutoCheckUpdate] = useState(() =>
    updateService.getAutoCheckEnabled(),
  );
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string>("");

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
        toast.success(
          `发现新版本: ${result.version}\n更新将在后台下载，完成后会提示您安装`,
          { id: toastId, duration: 8000 },
        );

        try {
          await updateService.installUpdate();
          toast.success("更新已下载完成，应用将在重启后更新", {
            duration: 5000,
          });
        } catch (installError) {
          const errorMsg =
            installError instanceof Error
              ? installError.message
              : String(installError);
          toast.error(`下载更新失败: ${errorMsg}`, {
            duration: 5000,
          });
        }
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
    handleCheckUpdate,
    handleToggleAutoCheckUpdate,
  };
}
