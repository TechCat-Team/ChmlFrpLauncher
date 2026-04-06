import { useState, useEffect } from "react";
import { fetchFlowLast7Days, type FlowPoint } from "@/services/api";
import type { UserInfo } from "@/services/api";
import { homePageCache } from "../cache";

export function useFlowData(userInfo: UserInfo | null) {
  const [flowData, setFlowData] = useState<FlowPoint[]>(() => {
    return homePageCache.flowData;
  });
  const [flowLoading, setFlowLoading] = useState(() => {
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

      if (homePageCache.flowData.length > 0) {
        setFlowData(homePageCache.flowData);
        setFlowLoading(false);
      } else {
        setFlowLoading(true);
      }

      setFlowError("");
      try {
        const data = await fetchFlowLast7Days();
        setFlowData(data);
        homePageCache.flowData = data;
      } catch (err) {
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
