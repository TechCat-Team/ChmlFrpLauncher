import { useEffect, useState, useRef } from "react";
import { fetchFlowLast7Days, fetchUserInfo, fetchSignInInfo, type FlowPoint, type UserInfo, type SignInInfo, getStoredUser, clearStoredUser, saveStoredUser, type StoredUser } from "../../services/api";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";

interface HomeProps {
  user?: StoredUser | null;
  onUserChange?: (user: StoredUser | null) => void;
}

export function Home({ user, onUserChange }: HomeProps) {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const onUserChangeRef = useRef(onUserChange);
  
  // 保持回调引用最新
  useEffect(() => {
    onUserChangeRef.current = onUserChange;
  }, [onUserChange]);

  const [flowData, setFlowData] = useState<FlowPoint[]>([]);
  const [flowLoading, setFlowLoading] = useState(true);
  const [flowError, setFlowError] = useState("");

  // 签到信息相关状态
  const [signInInfoHover, setSignInInfoHover] = useState(false);
  const [signInInfo, setSignInInfo] = useState<SignInInfo | null>(null);
  const [signInInfoLoading, setSignInInfoLoading] = useState(false);
  const [signInInfoError, setSignInInfoError] = useState("");

  // 获取最新用户信息
  useEffect(() => {
    const loadUserInfo = async () => {
      const storedUser = getStoredUser();
      if (!storedUser?.usertoken) {
        setUserInfo(null);
        return;
      }

      try {
        const data = await fetchUserInfo();
        setUserInfo(data);
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
        // token 无效，清除本地信息
        clearStoredUser();
        setUserInfo(null);
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
        return;
      }

      setFlowLoading(true);
      setFlowError("");
      try {
        const data = await fetchFlowLast7Days();
        setFlowData(data);
      } catch (err) {
        setFlowData([]);
        setFlowError(err instanceof Error ? err.message : "获取近7日流量失败");
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
      return;
    }

    const loadSignInInfo = async () => {
      try {
        const data = await fetchSignInInfo();
        setSignInInfo(data);
      } catch (err) {
        setSignInInfo(null);
        console.error("获取签到信息失败", err);
      }
    };

    loadSignInInfo();
  }, [userInfo?.usertoken]);

  // 当鼠标悬浮时获取签到信息
  useEffect(() => {
    if (!signInInfoHover || !userInfo?.usertoken) {
      return;
    }

    // 如果已有数据，不重复加载
    if (signInInfo) {
      return;
    }

    const loadSignInInfo = async () => {
      setSignInInfoLoading(true);
      setSignInInfoError("");
      try {
        const data = await fetchSignInInfo();
        setSignInInfo(data);
      } catch (err) {
        setSignInInfoError(err instanceof Error ? err.message : "获取签到信息失败");
        console.error("获取签到信息失败", err);
      } finally {
        setSignInInfoLoading(false);
      }
    };

    loadSignInInfo();
  }, [signInInfoHover, userInfo?.usertoken, signInInfo]);

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
              onMouseEnter={() => setSignInInfoHover(true)}
              onMouseLeave={() => setSignInInfoHover(false)}
            >
              <button 
                className="px-3 py-2 text-xs rounded border border-border/60 text-foreground hover:bg-foreground/[0.03] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!userInfo}
              >
                签到信息
              </button>
              
              {/* 悬浮菜单 */}
              {signInInfoHover && userInfo && (
                <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl bg-card/95 backdrop-blur-md border border-border/50 p-5 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  {signInInfoLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-6 w-6 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
                      <span className="ml-2 text-sm text-muted-foreground">加载中...</span>
                    </div>
                  ) : signInInfoError ? (
                    <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3">
                      <p className="text-sm text-destructive font-medium">{signInInfoError}</p>
                    </div>
                  ) : signInInfo ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-3">
                          <p className="text-xs text-muted-foreground mb-1">今日是否已签到</p>
                          <p className={`text-base font-semibold ${signInInfo.is_signed_in_today ? 'text-green-600' : 'text-orange-600'}`}>
                            {signInInfo.is_signed_in_today ? "已签到" : "未签到"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-3">
                          <p className="text-xs text-muted-foreground mb-1">总签到积分</p>
                          <p className="text-base font-semibold text-foreground">
                            {signInInfo.total_points.toLocaleString()}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-3">
                          <p className="text-xs text-muted-foreground mb-1">用户总签到次数</p>
                          <p className="text-base font-semibold text-foreground">
                            {signInInfo.total_sign_ins}
                          </p>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-3">
                          <p className="text-xs text-muted-foreground mb-1">今日签到人数</p>
                          <p className="text-base font-semibold text-foreground">
                            {signInInfo.count_of_matching_records}
                          </p>
                        </div>
                      </div>
                      <div className="rounded-xl border border-border/50 bg-foreground/[0.02] p-3">
                        <p className="text-xs text-muted-foreground mb-1">上次签到时间</p>
                        <p className="text-sm font-medium text-foreground">
                          {signInInfo.last_sign_in_time || "暂无记录"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-sm text-muted-foreground">
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
          <Accordion
            type="single"
            collapsible
            className="w-full"
          >
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
                  这是ChmlFrp的官方启动器，如果您没有账户，您应该前往我们的官网 <a href="https://www.chmlfrp.net" target="_blank" className="text-foreground hover:underline">https://www.chmlfrp.net</a> 进行注册。
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

        <div className="border border-border/60 rounded-lg p-5 bg-card md:col-span-3">
            <h2 className="text-sm font-semibold text-foreground">意见征集</h2>
            <p className="text-sm text-muted-foreground">
              我们欢迎您提出任何意见和建议，帮助我们改进客户端。
            </p>
        </div>
      </div>
    </div>
  );
}
