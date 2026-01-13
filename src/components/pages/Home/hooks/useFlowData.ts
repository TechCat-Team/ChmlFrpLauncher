import { useState, useEffect } from "react";
import { fetchFlowLast7Days, type FlowPoint } from "@/services/api";
import type { UserInfo } from "@/services/api";
import { homePageCache } from "../cache";

export function useFlowData(userInfo: UserInfo | null) {
  const [flowData, setFlowData] = useState<FlowPoint[]>(() => {
    // 初始化时如果有缓存数据，先显示缓存数据
    return homePageCache.flowData;
  });
  const [flowLoading, setFlowLoading] = useState(() => {
    // 如果有缓存数据，不显示加载状态
    return homePageCache.flowData.length === 0;
  });
  const [flowError, setFlowError] = useState("");

  useEffect(() => {
    const loadFlow = async () => {
      if (!userInfo?.usertoken) {
        setFlowLoading(false);
        homePageCache.flowData = [];
        return;
      }

      // 如果有缓存数据，先显示缓存数据
      if (homePageCache.flowData.length > 0) {
        setFlowData(homePageCache.flowData);
        setFlowLoading(false);
      } else {
        // 第一次加载，显示加载状态
        setFlowLoading(true);
      }

      setFlowError("");
      try {
        const data = await fetchFlowLast7Days();
        setFlowData(data);
        homePageCache.flowData = data;
      } catch (err) {
        // 如果加载失败且没有缓存数据，才显示错误
        if (homePageCache.flowData.length === 0) {
          setFlowData([]);
          setFlowError(
            err instanceof Error ? err.message : "获取近7日流量失败",
          );
        }
        console.error("获取近7日流量失败", err);
      } finally {
        setFlowLoading(false);
      }
    };
    loadFlow();
  }, [userInfo]);

  return {
    flowData,
    flowLoading,
    flowError,
  };
}

