import { useEffect } from "react";
import { toast } from "sonner";
import { updateService } from "@/services/updateService";
import { createUpdateInfoToast } from "../utils/toastHelpers";

/**
 * 更新检查 hook
 * 在应用启动时检查更新
 */
export function useUpdateCheck() {
  useEffect(() => {
    const checkUpdateOnStart = async () => {
      if (!updateService.getAutoCheckEnabled()) {
        return;
      }

      try {
        const result = await updateService.checkUpdate();
        if (result.available) {
          toast.info(createUpdateInfoToast(result.version || ""), {
            duration: 8000,
          });

          try {
            await updateService.installUpdate();
            toast.success("更新已下载完成，应用将在重启后更新", {
              duration: 5000,
            });
          } catch (installError) {
            console.error("自动下载更新失败:", installError);
          }
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
}
