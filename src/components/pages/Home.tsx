import { useEffect, useState, useRef } from "react";
import {
  fetchFlowLast7Days,
  fetchUserInfo,
  fetchSignInInfo,
  type FlowPoint,
  type UserInfo,
  type SignInInfo,
  getStoredUser,
  clearStoredUser,
  saveStoredUser,
  type StoredUser,
} from "../../services/api";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";

import { ExternalLinkIcon } from "lucide-react";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "../../components/ui/item";

// 数字计数动画 Hook
function useAnimatedNumber(
  value: number,
  duration: number = 500,
  shouldAnimate: boolean = true,
) {
  // 初始值设为实际值，如果不需要动画则直接显示
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const startValueRef = useRef(value);
  const animationFrameRef = useRef<number | null>(null);
  const previousValueRef = useRef(value);
  const previousShouldAnimateRef = useRef(shouldAnimate);
  const displayValueRef = useRef(value);
  const hasAnimatedRef = useRef(false);

  // 同步 displayValueRef
  useEffect(() => {
    displayValueRef.current = displayValue;
  }, [displayValue]);

  useEffect(() => {
    // 如果值没有变化且 shouldAnimate 也没有变化，不需要动画
    if (
      value === previousValueRef.current &&
      previousShouldAnimateRef.current === shouldAnimate
    ) {
      return;
    }

    const wasAnimating = previousShouldAnimateRef.current;
    previousValueRef.current = value;
    previousShouldAnimateRef.current = shouldAnimate;

    // 取消之前的动画
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // 如果不应该动画，直接更新值
    if (!shouldAnimate) {
      // 使用 setTimeout 避免同步 setState
      setTimeout(() => {
        setDisplayValue(value);
        displayValueRef.current = value;
        hasAnimatedRef.current = false;
      }, 0);
      return;
    }

    // 如果 shouldAnimate 从 false 变为 true，从 0 开始动画
    if (!wasAnimating && shouldAnimate && !hasAnimatedRef.current) {
      startValueRef.current = 0;
      displayValueRef.current = 0;
      // 使用 setTimeout 避免同步 setState
      setTimeout(() => {
        setDisplayValue(0);
      }, 0);
      hasAnimatedRef.current = true;
    } else {
      startValueRef.current = displayValueRef.current;
    }

    // 使用 requestAnimationFrame 延迟状态更新，避免同步 setState
    const startAnimation = () => {
      setIsAnimating(true);
      const startTime = performance.now();
      startTimeRef.current = startTime;

      const animate = (currentTime: number) => {
        if (!startTimeRef.current) return;

        const elapsed = currentTime - startTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);

        // 使用缓动函数
        const easeOutCubic = 1 - Math.pow(1 - progress, 3);
        const currentValue = Math.floor(
          startValueRef.current +
            (value - startValueRef.current) * easeOutCubic,
        );

        setDisplayValue(currentValue);
        displayValueRef.current = currentValue;

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate);
        } else {
          setDisplayValue(value);
          displayValueRef.current = value;
          setIsAnimating(false);
          startTimeRef.current = null;
        }
      };

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // 延迟启动动画，避免在 effect 中同步调用 setState
    const timeoutId = setTimeout(() => {
      requestAnimationFrame(startAnimation);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [value, duration, shouldAnimate]);

  // 当 shouldAnimate 变为 false 时，重置 hasAnimatedRef
  useEffect(() => {
    if (!shouldAnimate) {
      hasAnimatedRef.current = false;
    }
  }, [shouldAnimate]);

  return { displayValue, isAnimating };
}

// 模块级别的缓存，确保在组件卸载后数据仍然保留
const homePageCache = {
  userInfo: null as UserInfo | null,
  flowData: [] as FlowPoint[],
  signInInfo: null as SignInInfo | null,
};

interface HomeProps {
  user?: StoredUser | null;
  onUserChange?: (user: StoredUser | null) => void;
}

export function Home({ user, onUserChange }: HomeProps) {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const onUserChangeRef = useRef(onUserChange);

  // 标记是否是第一次加载
  const isFirstLoadRef = useRef(true);

  // 保持回调引用最新
  useEffect(() => {
    onUserChangeRef.current = onUserChange;
  }, [onUserChange]);

  const [flowData, setFlowData] = useState<FlowPoint[]>(() => {
    // 初始化时如果有缓存数据，先显示缓存数据
    return homePageCache.flowData;
  });
  const [flowLoading, setFlowLoading] = useState(() => {
    // 如果有缓存数据，不显示加载状态
    return homePageCache.flowData.length === 0;
  });
  const [flowError, setFlowError] = useState("");

  // 签到信息相关状态
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

  // 数字计数动画 - 只在菜单可见时触发动画
  const animatedTotalPoints = useAnimatedNumber(
    signInInfo?.total_points || 0,
    800,
    signInInfoVisible && !!signInInfo,
  );
  const animatedTotalSignIns = useAnimatedNumber(
    signInInfo?.total_sign_ins || 0,
    600,
    signInInfoVisible && !!signInInfo,
  );
  const animatedCountOfRecords = useAnimatedNumber(
    signInInfo?.count_of_matching_records || 0,
    600,
    signInInfoVisible && !!signInInfo,
  );

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
      // 重置动画状态，下次打开时从 0 开始动画
      // 通过将 shouldAnimate 变为 false 来触发重置
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

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="border border-border/60 rounded-lg p-6 bg-card">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">ChmlFrp Launcher</p>
            <h1 className="text-2xl font-semibold text-foreground mt-1">
              欢迎回来{userInfo?.username ? `，${userInfo.username}` : ""}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2 relative">
            {!signInInfo?.is_signed_in_today && (
              <button
                className="px-3 py-2 text-xs rounded bg-foreground text-background font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!userInfo}
              >
                签到
              </button>
            )}
            <div
              className="relative"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <button
                className="px-3 py-2 text-xs rounded border border-border/60 text-foreground hover:bg-foreground/[0.03] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!userInfo}
              >
                签到信息
              </button>

              {/* 悬浮菜单 */}
              {signInInfoHover && userInfo && (
                <div
                  className={`absolute right-0 top-full mt-1 w-80 rounded-2xl bg-card/95 backdrop-blur-md border border-border/50 p-5 shadow-2xl z-50 ${
                    signInInfoClosing
                      ? "animate-fade-out"
                      : "animate-slide-in-from-top-2 animate-scale-in"
                  }`}
                  onMouseEnter={handleMouseEnter}
                  onMouseLeave={handleMouseLeave}
                >
                  {signInInfoLoading ? (
                    <div className="flex items-center justify-center py-8 animate-fade-in-up">
                      <div className="h-6 w-6 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
                      <span className="ml-2 text-sm text-muted-foreground">
                        加载中...
                      </span>
                    </div>
                  ) : signInInfoError ? (
                    <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 animate-fade-in-up">
                      <p className="text-sm text-destructive font-medium">
                        {signInInfoError}
                      </p>
                    </div>
                  ) : signInInfo ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-3 transition-all hover:border-border hover:bg-foreground/[0.04] animate-card-delay-1">
                          <p className="text-xs text-muted-foreground mb-1">
                            今日是否已签到
                          </p>
                          <p
                            className={`text-base font-semibold transition-colors ${signInInfo.is_signed_in_today ? "text-green-600 dark:text-green-500" : "text-orange-600 dark:text-orange-500"}`}
                          >
                            {signInInfo.is_signed_in_today
                              ? "已签到"
                              : "未签到"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-3 transition-all hover:border-border hover:bg-foreground/[0.04] animate-card-delay-2">
                          <p className="text-xs text-muted-foreground mb-1">
                            总签到积分
                          </p>
                          <p className="text-base font-semibold text-foreground animate-number-count">
                            {signInInfoVisible &&
                            animatedTotalPoints.isAnimating
                              ? animatedTotalPoints.displayValue.toLocaleString()
                              : signInInfo.total_points.toLocaleString()}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-3 transition-all hover:border-border hover:bg-foreground/[0.04] animate-card-delay-3">
                          <p className="text-xs text-muted-foreground mb-1">
                            用户总签到次数
                          </p>
                          <p className="text-base font-semibold text-foreground animate-number-count">
                            {signInInfoVisible &&
                            animatedTotalSignIns.isAnimating
                              ? animatedTotalSignIns.displayValue
                              : signInInfo.total_sign_ins}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-3 transition-all hover:border-border hover:bg-foreground/[0.04] animate-card-delay-4">
                          <p className="text-xs text-muted-foreground mb-1">
                            今日签到人数
                          </p>
                          <p className="text-base font-semibold text-foreground animate-number-count">
                            {signInInfoVisible &&
                            animatedCountOfRecords.isAnimating
                              ? animatedCountOfRecords.displayValue
                              : signInInfo.count_of_matching_records}
                          </p>
                        </div>
                      </div>
                      <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-3 transition-all hover:border-border hover:bg-foreground/[0.04] animate-card-delay-5">
                        <p className="text-xs text-muted-foreground mb-1">
                          上次签到时间
                        </p>
                        <p className="text-sm font-medium text-foreground">
                          {signInInfo.last_sign_in_time || "暂无记录"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-sm text-muted-foreground animate-fade-in-up">
                      暂无数据
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border border-border/60 rounded-lg p-5 bg-card">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">账号状态</h2>
            <span
              className={`text-[11px] px-2 py-1 rounded ${
                userInfo
                  ? "bg-foreground text-background"
                  : "border border-border/60 text-muted-foreground"
              }`}
            >
              {userInfo ? "已登录" : "未登录"}
            </span>
          </div>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            {userInfo ? (
              <>
                <p className="text-foreground">你好，{userInfo.username}</p>
                <p>用户组：{userInfo.usergroup || "未分组"}</p>
                <p>
                  隧道量：{userInfo.tunnelCount} / {userInfo.tunnel}
                </p>
              </>
            ) : (
              <p>点击左侧头像即可登录账号，登录后会在这里显示用户信息。</p>
            )}
          </div>
        </div>

        <div className="border border-border/60 rounded-lg p-5 bg-card md:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">近7日流量</h2>
          </div>

          <div className="mt-3 text-sm text-muted-foreground">
            {flowLoading ? (
              <div>加载中...</div>
            ) : flowError ? (
              <div className="text-destructive">{flowError}</div>
            ) : flowData.length === 0 ? (
              <div>暂无数据</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                {flowData.map((item) => (
                  <div
                    key={item.time}
                    className="rounded border border-border/60 p-2 bg-foreground/[0.015]"
                  >
                    <div className="text-xs text-muted-foreground">
                      {item.time}
                    </div>
                    <div className="text-[13px] text-foreground mt-1">
                      ↑ {item.traffic_in}
                    </div>
                    <div className="text-[13px] text-foreground">
                      ↓ {item.traffic_out}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border border-border/60 rounded-lg p-5 bg-card md:col-span-3">
          <h2 className="text-sm font-semibold text-foreground mb-3">
            常见问题
          </h2>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger>软件出现了BUG怎么办</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-4 text-balance">
                <p>
                  软件目前为公开测试版，使用途中遇见的任何问题，请在任意交流群中反馈问题，我们会尽快修复。
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>我应该去哪注册账号</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-4 text-balance">
                <p>
                  这是ChmlFrp的官方启动器，如果您没有账户，您应该前往我们的官网{" "}
                  <a
                    href="https://www.chmlfrp.net"
                    target="_blank"
                    className="text-foreground hover:underline"
                  >
                    https://www.chmlfrp.net
                  </a>{" "}
                  进行注册。
                </p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>关于映射延迟问题</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-4 text-balance">
                <p>
                  节点请尽量选择距离运行映射设备最近的节点。同时，您可以根据节点状态页中的节点负载选择负载较低的节点，这能够优化您的体验。
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <Item
          variant="outline"
          asChild
          className="border border-border/60 rounded-lg p-5 bg-card md:col-span-3"
        >
          <a href="#" target="_blank" rel="noopener noreferrer">
            <ItemContent>
              <ItemTitle>意见征集</ItemTitle>
              <ItemDescription className="text-xs">
                我们欢迎您提出任何意见和建议，帮助我们改进客户端。
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <ExternalLinkIcon className="size-4" />
            </ItemActions>
          </a>
        </Item>
      </div>
    </div>
  );
}
