import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TitleBar, WindowControls } from "@/components/TitleBar";
import { Home } from "@/components/pages/Home";
import { TunnelList } from "@/components/pages/TunnelList";
import { Logs } from "@/components/pages/Logs";
import { Settings } from "@/components/pages/Settings";
import { getStoredUser, fetchUserInfo, type StoredUser, type UserInfo } from "@/services/api";
import { AntivirusWarningDialog } from "@/components/dialogs/AntivirusWarningDialog";
import { CloseConfirmDialog } from "@/components/dialogs/CloseConfirmDialog";
import { UpdateDialog } from "@/components/dialogs/UpdateDialog";
import { useAppTheme } from "@/components/App/hooks/useAppTheme";
import { useAppThemeColor } from "@/components/App/hooks/useAppThemeColor";
import { useWindowEvents } from "@/components/App/hooks/useWindowEvents";
import { useAppInitialization } from "@/components/App/hooks/useAppInitialization";
import { useTunnelNotifications } from "@/components/App/hooks/useTunnelNotifications";
import { useTitleBar } from "@/components/App/hooks/useTitleBar";
import { useBackground } from "@/components/App/hooks/useBackground";
import { useDeepLink } from "@/components/App/hooks/useDeepLink";
import { useFrpcDownload } from "@/components/App/hooks/useFrpcDownload";
import { useUpdateCheck } from "@/components/App/hooks/useUpdateCheck";
import { useAutoStartTunnels } from "@/components/App/hooks/useAutoStartTunnels";
import { updateService } from "@/services/updateService";
import { toast } from "sonner";
import { BackgroundLayer } from "@/components/App/components/BackgroundLayer";
import { getInitialSidebarMode } from "@/components/pages/Settings/utils";
import type { SidebarMode } from "@/components/pages/Settings/types";
import { cn } from "@/lib/utils";

function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [user, setUser] = useState<StoredUser | null>(() => getStoredUser());
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const appContainerRef = useRef<HTMLDivElement>(null);

  // 核心背景 Hook (现在处于顶层，计时器不会随页面切换停止)
  const bg = useBackground();

  // 布局与系统环境判断
  const initialSidebarMode = getInitialSidebarMode();
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() => initialSidebarMode);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => initialSidebarMode !== "classic");

  const isMacOS = typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const isWindows = typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("WIN") >= 0;

  // 其他功能 Hooks
  useAppTheme();
  useAppThemeColor();
  useAppInitialization();
  useAutoStartTunnels(user);
  useDeepLink(user);
  useTunnelNotifications(activeTab);
  const { showCloseConfirmDialog, setShowCloseConfirmDialog } = useWindowEvents();
  const { showTitleBar } = useTitleBar();
  const { updateInfo, setUpdateInfo } = useUpdateCheck();
  const { showAntivirusWarning, setShowAntivirusWarning } = useFrpcDownload();

  // 常量计算
  const shouldShowTitleBar = isMacOS ? showTitleBar : isWindows ? showTitleBar : true;
  const isTitleBarHidden = (isMacOS || isWindows) && !showTitleBar;
  const shouldPadTop = shouldShowTitleBar || (isWindows && !showTitleBar);
  const SIDEBAR_LEFT = isMacOS && !showTitleBar ? 10 : 15;
  const SIDEBAR_COLLAPSED_WIDTH = Math.round(((20 * 5) / 3) * 2);

  // 主题与更新监听
  useEffect(() => {
    const handleSidebarModeChange = () => {
      const nextMode = getInitialSidebarMode();
      setSidebarMode(nextMode);
      setSidebarCollapsed(nextMode !== "classic");
    };
    window.addEventListener("sidebarModeChanged", handleSidebarModeChange);
    return () => window.removeEventListener("sidebarModeChanged", handleSidebarModeChange);
  }, []);

  useEffect(() => {
    const loadUserInfo = async () => {
      if (!user?.usertoken) { setUserInfo(null); return; }
      try { const data = await fetchUserInfo(); setUserInfo(data); } catch { setUserInfo(null); }
    };
    void loadUserInfo();
  }, [user?.usertoken]);

  // 内容渲染与事件处理
  const content = useMemo(() => {
    switch (activeTab) {
      case "home": return <Home user={user} onUserChange={setUser} />;
      case "tunnels": return <TunnelList user={user} />;
      case "logs": return <Logs />;
      case "settings": return <Settings />;
      default: return <Home user={user} onUserChange={setUser} />;
    }
  }, [activeTab, user]);

  const handleVideoLoadedData = useCallback(() => {
    if (bg.videoRef.current) {
      bg.videoRef.current.volume = bg.videoVolume / 100;
      bg.videoRef.current.play().catch(() => {});
    }
  }, [bg.videoRef, bg.videoVolume]);

  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const handleUpdate = useCallback(async () => {
    if (!updateInfo) return;
    setIsDownloadingUpdate(true);
    setDownloadProgress(0);
    try {
      await updateService.installUpdate((p) => setDownloadProgress(p));
      toast.success("更新已下载完成，重启后生效");
      setUpdateInfo(null);
    } catch (e) {
      toast.error(`更新失败: ${String(e)}`);
    } finally {
      setIsDownloadingUpdate(false);
    }
  }, [updateInfo, setUpdateInfo]);

  return (
      <>
        <div
            ref={appContainerRef}
            className={cn(
              "flex flex-col h-screen w-screen overflow-hidden text-foreground relative",
              bg.effectType === "frosted" && "frosted-glass-enabled",
              bg.effectType === "translucent" && "translucent-enabled",
            )}
            style={{
              // 如果没有背景图，应用默认背景色
              backgroundColor: !bg.backgroundImage ? bg.getBackgroundColorWithOpacity(100) : "transparent",
            }}
        >
          <BackgroundLayer
              backgroundImage={bg.backgroundImage}
              imageSrc={bg.imageSrc}
              backgroundType={bg.backgroundType}
              videoSrc={bg.videoSrc}
              videoLoadError={bg.videoLoadError}
              videoRef={bg.videoRef}
              videoStartSound={bg.videoStartSound}
              overlayOpacity={bg.overlayOpacity}
              blur={bg.blur}
              getBackgroundColorWithOpacity={bg.getBackgroundColorWithOpacity}
              appContainerRef={appContainerRef}
              onVideoError={() => {}}
              onVideoLoadedData={handleVideoLoadedData}
          />

          {shouldShowTitleBar && <div className="relative z-50"><TitleBar /></div>}
          {isWindows && !showTitleBar && (
              <div data-tauri-drag-region className="absolute top-0 right-0 left-0 z-50 h-9 flex items-center justify-end pr-2">
                <WindowControls />
              </div>
          )}

          {(sidebarMode === "floating" || sidebarMode === "floating_fixed") ? (
              <>
                <div
                    className="absolute z-50"
                    style={{
                      left: `${SIDEBAR_LEFT}px`,
                      top: isTitleBarHidden ? (isMacOS ? "10px" : "12px") : "48px",
                      bottom: "12px",
                    }}
                >
                  <Sidebar
                      activeTab={activeTab}
                      onTabChange={setActiveTab}
                      user={user}
                      onUserChange={setUser}
                      collapsed={sidebarCollapsed}
                      onCollapseChange={setSidebarCollapsed}
                      collapsedWidth={SIDEBAR_COLLAPSED_WIDTH}
                      mode={sidebarMode}
                      userInfo={userInfo}
                  />
                </div>
                <div
                    className="absolute z-40 overflow-hidden rounded-b-[12px]"
                    style={{
                      left: `${SIDEBAR_LEFT + SIDEBAR_COLLAPSED_WIDTH}px`,
                      right: "0",
                      top: shouldPadTop ? "36px" : "0",
                      bottom: "0",
                    }}
                >
                  <div className="h-full overflow-auto px-6 pt-4 pb-6 md:px-8 md:pt-6 md:pb-8">
                    <div className="max-w-6xl mx-auto w-full h-full flex flex-col">{content}</div>
                  </div>
                </div>
              </>
          ) : (
              <div className="relative flex flex-1 overflow-hidden">
                <Sidebar
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    user={user}
                    onUserChange={setUser}
                    mode="classic"
                    userInfo={userInfo}
                />
                <div className="flex-1 flex flex-col overflow-hidden relative">
                  {isMacOS && !showTitleBar && <div data-tauri-drag-region className="h-8 flex-shrink-0 w-full" />}
                  <div className={`flex-1 overflow-auto px-6 pb-6 md:px-8 md:pb-8 ${shouldPadTop ? "pt-4 md:pt-6" : "pt-0"}`}>
                    <div className="max-w-6xl mx-auto w-full h-full flex flex-col">{content}</div>
                  </div>
                </div>
              </div>
          )}
        </div>

        <AntivirusWarningDialog isOpen={showAntivirusWarning} onClose={() => setShowAntivirusWarning(false)} onConfirm={() => setActiveTab("settings")} />
        <CloseConfirmDialog
            isOpen={showCloseConfirmDialog}
            onClose={() => setShowCloseConfirmDialog(false)}
            onMinimizeToTray={() => { window.dispatchEvent(new CustomEvent("minimizeToTray")); setShowCloseConfirmDialog(false); }}
            onCloseApp={() => { window.dispatchEvent(new CustomEvent("closeApp")); setShowCloseConfirmDialog(false); }}
        />
        {updateInfo && (
            <UpdateDialog
                isOpen={!!updateInfo} onClose={() => !isDownloadingUpdate && setUpdateInfo(null)}
                onUpdate={handleUpdate} version={updateInfo.version} date={updateInfo.date} body={updateInfo.body}
                isDownloading={isDownloadingUpdate} downloadProgress={downloadProgress}
            />
        )}
      </>
  );
}

export default App;
