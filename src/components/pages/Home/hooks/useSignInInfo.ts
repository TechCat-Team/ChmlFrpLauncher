import { useState, useEffect, useRef } from "react";
import { fetchSignInInfo, type SignInInfo } from "@/services/api";
import type { UserInfo } from "@/services/api";
import { homePageCache } from "../cache";

export function useSignInInfo(userInfo: UserInfo | null) {
  const [signInInfoHover, setSignInInfoHover] = useState(false);
  const [signInInfo, setSignInInfo] = useState<SignInInfo | null>(() => {
    return homePageCache.signInInfo;
  });
  const [signInInfoLoading, setSignInInfoLoading] = useState(false);
  const [signInInfoError, setSignInInfoError] = useState("");
  const [signInInfoVisible, setSignInInfoVisible] = useState(false);
  const [signInInfoClosing, setSignInInfoClosing] = useState(false);

  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleMouseLeave = () => {
    clearCloseTimeout();
    setSignInInfoClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setSignInInfoHover(false);
      setSignInInfoVisible(false);
      setSignInInfoClosing(false);
    }, 200);
  };

  const handleMouseEnter = () => {
    clearCloseTimeout();
    setSignInInfoClosing(false);
    setSignInInfoHover(true);
    if (signInInfo) {
      setTimeout(() => setSignInInfoVisible(true), 50);
    } else {
      setSignInInfoVisible(true);
    }
  };

  useEffect(() => {
    if (!userInfo?.usertoken) {
      setSignInInfo(null);
      homePageCache.signInInfo = null;
      return;
    }

    if (homePageCache.signInInfo) {
      setSignInInfo(homePageCache.signInInfo);
    }

    const loadSignInInfo = async () => {
      try {
        const data = await fetchSignInInfo();
        setSignInInfo(data);
        homePageCache.signInInfo = data;
        if (signInInfoHover) {
          setSignInInfoVisible(true);
        }
      } catch (err) {
        if (!homePageCache.signInInfo) {
          setSignInInfo(null);
        }
        console.error("获取签到信息失败", err);
      }
    };

    loadSignInInfo();
  }, [userInfo?.usertoken, signInInfoHover]);

  useEffect(() => {
    if (!signInInfoHover || !userInfo?.usertoken) {
      return;
    }

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
