import { useEffect, useState } from "react";
import { updateService, type UpdateInfo } from "@/services/updateService";

/**
 * 更新检查 hook
 * 在应用启动时检查更新
 */
export function useUpdateCheck() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    const checkUpdateOnStart = async () => {
      if (!updateService.getAutoCheckEnabled()) {
        return;
      }

      try {
        const result = await updateService.checkUpdate();
        if (result.available) {
          setUpdateInfo({
            version: result.version || "",
            date: result.date,
            body: result.body,
          });
        }
      } catch (error) {
        console.error("自动检测更新失败:", error);
      }
    };

    const timer = setTimeout(() => {
      checkUpdateOnStart();
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return {
    updateInfo,
    setUpdateInfo,
  };
}
