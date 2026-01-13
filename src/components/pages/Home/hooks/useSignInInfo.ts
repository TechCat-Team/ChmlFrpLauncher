import { useState, useEffect, useRef } from "react";
import { fetchSignInInfo, type SignInInfo } from "@/services/api";
import type { UserInfo } from "@/services/api";
import { homePageCache } from "../cache";

export function useSignInInfo(userInfo: UserInfo | null) {
  const [signInInfoHover, setSignInInfoHover] = useState(false);
  const [signInInfo, setSignInInfo] = useState<SignInInfo | null>(() => {
    // 初始化时如果有缓存数据，先显示缓存数据
    return homePageCache.signInInfo;
  });
  const [signInInfoLoading, setSignInInfoLoading] = useState(false);
  const [signInInfoError, setSignInInfoError] = useState("");
  const [signInInfoVisible, setSignInInfoVisible] = useState(false);
  const [signInInfoClosing, setSignInInfoClosing] = useState(false);

  // 延迟关闭的 timeout 引用
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 清除关闭延迟
  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  // 延迟关闭悬浮菜单
  const handleMouseLeave = () => {
    clearCloseTimeout();
    setSignInInfoClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setSignInInfoHover(false);
      setSignInInfoVisible(false);
      setSignInInfoClosing(false);
    }, 200); // 200ms 延迟，给用户足够时间移动鼠标
  };

  // 鼠标进入时取消关闭
  const handleMouseEnter = () => {
    clearCloseTimeout();
    setSignInInfoClosing(false);
    setSignInInfoHover(true);
    if (signInInfo) {
      // 延迟一点显示，让弹出动画更流畅
      setTimeout(() => setSignInInfoVisible(true), 50);
    } else {
      setSignInInfoVisible(true);
    }
  };

  // 当用户信息加载后，自动获取签到信息（用于判断是否显示签到按钮）
  useEffect(() => {
    if (!userInfo?.usertoken) {
      setSignInInfo(null);
      homePageCache.signInInfo = null;
      return;
    }

    // 如果有缓存数据，先显示缓存数据
    if (homePageCache.signInInfo) {
      setSignInInfo(homePageCache.signInInfo);
    }

    const loadSignInInfo = async () => {
      try {
        const data = await fetchSignInInfo();
        setSignInInfo(data);
        homePageCache.signInInfo = data;
        // 如果悬浮菜单已显示，触发数字动画
        if (signInInfoHover) {
          setSignInInfoVisible(true);
        }
      } catch (err) {
        // 如果加载失败且没有缓存数据，才清除
        if (!homePageCache.signInInfo) {
          setSignInInfo(null);
        }
        console.error("获取签到信息失败", err);
      }
    };

    loadSignInInfo();
  }, [userInfo?.usertoken, signInInfoHover]);

  // 当鼠标悬浮时获取签到信息
  useEffect(() => {
    if (!signInInfoHover || !userInfo?.usertoken) {
      return;
    }

    // 如果已有数据，不重复加载，但触发动画
    if (signInInfo) {
      setTimeout(() => setSignInInfoVisible(true), 50);
      return;
    }

    const loadSignInInfo = async () => {
      setSignInInfoLoading(true);
      setSignInInfoError("");
      try {
        const data = await fetchSignInInfo();
        setSignInInfo(data);
        homePageCache.signInInfo = data;
        // 数据加载完成后触发动画
        setTimeout(() => setSignInInfoVisible(true), 50);
      } catch (err) {
        setSignInInfoError(
          err instanceof Error ? err.message : "获取签到信息失败",
        );
        console.error("获取签到信息失败", err);
      } finally {
        setSignInInfoLoading(false);
      }
    };

    loadSignInInfo();
  }, [signInInfoHover, userInfo?.usertoken, signInInfo]);

  // 组件卸载时清理 timeout
  useEffect(() => {
    return () => {
      clearCloseTimeout();
    };
  }, []);

  return {
    signInInfo,
    signInInfoHover,
    signInInfoLoading,
    signInInfoError,
    signInInfoVisible,
    signInInfoClosing,
    handleMouseEnter,
    handleMouseLeave,
  };
}

