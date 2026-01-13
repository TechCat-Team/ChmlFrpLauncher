import { useState, useEffect, useRef } from "react";
import {
  fetchUserInfo,
  getStoredUser,
  clearStoredUser,
  saveStoredUser,
  type UserInfo,
  type StoredUser,
} from "@/services/api";
import { homePageCache } from "../cache";

export function useUserInfo(
  user: StoredUser | null | undefined,
  onUserChange?: (user: StoredUser | null) => void,
) {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const onUserChangeRef = useRef(onUserChange);
  const isFirstLoadRef = useRef(true);

  // 保持回调引用最新
  useEffect(() => {
    onUserChangeRef.current = onUserChange;
  }, [onUserChange]);

  // 初始化时如果有缓存数据，立即显示
  useEffect(() => {
    const storedUser = getStoredUser();
    if (
      storedUser?.usertoken &&
      homePageCache.userInfo &&
      homePageCache.userInfo.usertoken === storedUser.usertoken
    ) {
      setUserInfo(homePageCache.userInfo);
      isFirstLoadRef.current = false;
    }
  }, []);

  // 获取最新用户信息
  useEffect(() => {
    const loadUserInfo = async () => {
      const storedUser = getStoredUser();
      if (!storedUser?.usertoken) {
        setUserInfo(null);
        homePageCache.userInfo = null;
        homePageCache.flowData = [];
        homePageCache.signInInfo = null;
        return;
      }

      // 如果有缓存数据且 token 匹配，先显示缓存数据
      if (
        homePageCache.userInfo &&
        homePageCache.userInfo.usertoken === storedUser.usertoken
      ) {
        setUserInfo(homePageCache.userInfo);
        isFirstLoadRef.current = false;
      } else {
        // token 不匹配或首次加载，清除相关缓存
        if (homePageCache.userInfo?.usertoken !== storedUser.usertoken) {
          homePageCache.flowData = [];
          homePageCache.signInInfo = null;
        }
        // 第一次加载，显示加载状态
        isFirstLoadRef.current = true;
      }

      try {
        const data = await fetchUserInfo();
        setUserInfo(data);
        homePageCache.userInfo = data;
        isFirstLoadRef.current = false;
        // 更新本地存储的用户信息
        const updatedUser = {
          username: data.username,
          usergroup: data.usergroup,
          userimg: data.userimg,
          usertoken: data.usertoken,
          tunnelCount: data.tunnelCount,
          tunnel: data.tunnel,
        };
        saveStoredUser(updatedUser);
      } catch (err) {
        // token 无效，清除本地信息和缓存
        clearStoredUser();
        setUserInfo(null);
        homePageCache.userInfo = null;
        homePageCache.flowData = [];
        homePageCache.signInInfo = null;
        // 通知父组件用户信息已清除
        onUserChangeRef.current?.(null);
        console.error("获取用户信息失败", err);
      }
    };
    loadUserInfo();
  }, [user?.usertoken]); // 当 user 的 token 变化时重新获取

  return {
    userInfo,
  };
}

